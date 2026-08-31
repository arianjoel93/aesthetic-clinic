<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/appointments.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

$payload = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($payload)) {
    $payload = [];
}

$action = (string) ($_GET['action'] ?? $payload['action'] ?? 'list');
$store = loadStore($dataFile);

try {
    if ($action === 'list') {
        respond(true, ['appointments' => array_values($store['appointments']), 'notifications' => array_values($store['notifications'])]);
    }

    if ($action === 'create') {
        $appointment = sanitizeAppointment($payload['appointment'] ?? []);
        $appointment['id'] = 'host-' . bin2hex(random_bytes(8));
        $appointment['createdAt'] = date(DATE_ATOM);
        $store['appointments'][$appointment['id']] = $appointment;
        pushNotification($store, $appointment, 'Nueva cita', "{$appointment['customerName']} - {$appointment['service']} ({$appointment['date']} {$appointment['start']})", 'appointment_created');
        saveStore($dataFile, $store);
        respond(true, ['appointment' => $appointment]);
    }

    if ($action === 'update') {
        $id = (string) ($payload['id'] ?? '');
        if ($id === '' || !isset($store['appointments'][$id])) {
            respond(false, ['message' => 'No encontramos la cita.'], 404);
        }
        $previous = $store['appointments'][$id];
        $patch = is_array($payload['patch'] ?? null) ? $payload['patch'] : [];
        $updated = array_merge($previous, sanitizeAppointmentPatch($patch));
        $store['appointments'][$id] = $updated;
        if (($previous['status'] ?? '') !== ($updated['status'] ?? '')) {
            statusNotification($store, $updated, (string) $updated['status']);
        }
        saveStore($dataFile, $store);
        respond(true, ['appointment' => $updated]);
    }

    if ($action === 'delete') {
        $ids = is_array($payload['ids'] ?? null) ? $payload['ids'] : [];
        foreach ($ids as $id) {
            unset($store['appointments'][(string) $id]);
        }
        $store['notifications'] = array_filter($store['notifications'], static fn($notification) => !in_array($notification['appointmentId'] ?? '', $ids, true));
        saveStore($dataFile, $store);
        respond(true, ['deleted' => $ids]);
    }

    if ($action === 'find-by-token') {
        $token = trim((string) ($payload['token'] ?? $_GET['token'] ?? ''));
        $appointment = findByToken($store, $token);
        respond((bool) $appointment, ['appointment' => $appointment]);
    }

    if ($action === 'confirm') {
        $token = trim((string) ($payload['token'] ?? ''));
        $status = (string) ($payload['status'] ?? '');
        if ($status !== 'aceptada' && $status !== 'rechazada') {
            respond(false, ['message' => 'Estado inválido.'], 400);
        }
        $appointment = findByToken($store, $token);
        if (!$appointment) {
            respond(false, ['message' => 'No encontramos una cita asociada a este enlace.'], 404);
        }
        $appointment['status'] = $status;
        $store['appointments'][$appointment['id']] = $appointment;
        statusNotification($store, $appointment, $status);
        saveStore($dataFile, $store);
        respond(true, ['appointment' => $appointment]);
    }

    respond(false, ['message' => 'Acción no permitida.'], 400);
} catch (Throwable $error) {
    error_log('appointments-store failed: ' . $error->getMessage());
    respond(false, ['message' => 'No se pudo procesar la cita.'], 500);
}

function loadStore(string $file): array
{
    if (!file_exists($file)) {
        return ['appointments' => [], 'notifications' => []];
    }
    $data = json_decode(file_get_contents($file) ?: '{}', true);
    return [
        'appointments' => is_array($data['appointments'] ?? null) ? $data['appointments'] : [],
        'notifications' => is_array($data['notifications'] ?? null) ? $data['notifications'] : [],
    ];
}

function saveStore(string $file, array $store): void
{
    file_put_contents($file, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function respond(bool $ok, array $data = [], int $status = 200): void
{
    http_response_code($status);
    echo json_encode(array_merge(['ok' => $ok], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitizeAppointment(array $input): array
{
    return array_merge([
        'customerName' => 'Cliente',
        'customerEmail' => '',
        'customerWhatsapp' => '',
        'service' => 'Servicio',
        'serviceSubtype' => '',
        'date' => date('Y-m-d'),
        'start' => '09:00',
        'end' => '10:00',
        'status' => 'creada',
        'cost' => 0,
        'discountPercent' => 0,
        'confirmationToken' => '',
        'notes' => '',
    ], sanitizeAppointmentPatch($input));
}

function sanitizeAppointmentPatch(array $input): array
{
    $allowed = ['id', 'customerName', 'customerEmail', 'customerWhatsapp', 'service', 'serviceSubtype', 'date', 'start', 'end', 'status', 'cost', 'discountPercent', 'autoGenerated', 'parentAppointmentId', 'confirmationToken', 'notes'];
    $output = [];
    foreach ($allowed as $key) {
        if (array_key_exists($key, $input)) {
            $output[$key] = is_string($input[$key]) ? trim($input[$key]) : $input[$key];
        }
    }
    return $output;
}

function findByToken(array $store, string $token): ?array
{
    if ($token === '') return null;
    foreach ($store['appointments'] as $appointment) {
        if (($appointment['confirmationToken'] ?? '') === $token) {
            return $appointment;
        }
    }
    return null;
}

function pushNotification(array &$store, array $appointment, string $title, string $message, string $kind): void
{
    $dedupeKey = ($appointment['id'] ?? '') . ':' . $kind . ':' . ($appointment['status'] ?? '');
    foreach ($store['notifications'] as $existing) {
        if (($existing['dedupeKey'] ?? '') === $dedupeKey) return;
    }
    array_unshift($store['notifications'], [
        'id' => 'host-not-' . bin2hex(random_bytes(8)),
        'appointmentId' => $appointment['id'] ?? '',
        'title' => $title,
        'message' => $message,
        'kind' => $kind,
        'date' => date('Y-m-d'),
        'read' => false,
        'dedupeKey' => $dedupeKey,
    ]);
}

function statusNotification(array &$store, array $appointment, string $status): void
{
    if ($status === 'aceptada') {
        pushNotification($store, $appointment, 'Cita confirmada', "{$appointment['customerName']} confirmó su cita de {$appointment['service']} ({$appointment['date']} {$appointment['start']}).", 'appointment_confirmed');
        return;
    }
    if ($status === 'rechazada') {
        pushNotification($store, $appointment, 'Cita rechazada por cliente', "{$appointment['customerName']} rechazó su cita de {$appointment['service']} ({$appointment['date']} {$appointment['start']}).", 'appointment_status_changed');
        return;
    }
    pushNotification($store, $appointment, 'Estado de cita actualizado', "{$appointment['customerName']}: {$status}", 'appointment_status_changed');
}
