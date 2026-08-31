<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Método no permitido.', 405);
}

$config = require __DIR__ . '/mail-config.php';
$payload = json_decode(file_get_contents('php://input') ?: '{}', true);

if (!is_array($payload)) {
    respond(false, 'No se pudo leer la información de la cita.', 400);
}

$to = trim((string) ($payload['to'] ?? ''));
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'El cliente no tiene un correo válido registrado.', 400);
}

try {
    $email = buildAppointmentEmail($payload, $config);
    sendSmtpMail($config, $to, $email['subject'], $email['text'], $email['html']);
    respond(true, 'Correo enviado correctamente.');
} catch (Throwable $error) {
    error_log('appointment mail failed: ' . $error->getMessage());
    respond(false, friendlyMailError($error->getMessage()), 500);
}

function respond(bool $ok, string $message, int $status = 200): void
{
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function friendlyMailError(string $message): string
{
    if (preg_match('/auth|login|password|535|534|530/i', $message)) {
        return 'No se pudo autenticar la cuenta de correo. Revisa usuario y contraseña del buzón.';
    }

    if (preg_match('/connect|timed out|timeout|tls|ssl|certificate|refused|network/i', $message)) {
        return 'No se pudo conectar con el servidor SMTP. Verifica host, puerto y SSL.';
    }

    return 'No se pudo enviar el correo. Revisa la configuración del servidor de correo.';
}

function buildAppointmentEmail(array $payload, array $config): array
{
    $customerName = trim((string) ($payload['customerName'] ?? 'cliente'));
    $service = trim((string) ($payload['service'] ?? 'Servicio agendado'));
    $subtype = trim((string) ($payload['serviceSubtype'] ?? ''));
    $serviceName = $subtype !== '' ? "$service - $subtype" : $service;
    $date = trim((string) ($payload['date'] ?? ''));
    $start = trim((string) ($payload['start'] ?? ''));
    $end = trim((string) ($payload['end'] ?? ''));
    $confirmationLink = trim((string) ($payload['confirmationLink'] ?? ''));
    $kind = (string) ($payload['kind'] ?? 'confirmation');
    $isReminder = $kind === 'reminder';
    $subject = $isReminder ? 'Recordatorio de tu cita' : 'Confirma tu cita';
    $intro = $isReminder
        ? 'Te recordamos que tienes una cita agendada para mañana.'
        : 'Tu cita fue registrada correctamente. Puedes confirmarla o cancelarla desde el siguiente enlace.';

    $safeName = htmlspecialchars($customerName, ENT_QUOTES, 'UTF-8');
    $safeService = htmlspecialchars($serviceName, ENT_QUOTES, 'UTF-8');
    $safeWhen = htmlspecialchars(trim("$date de $start a $end"), ENT_QUOTES, 'UTF-8');
    $safeIntro = htmlspecialchars($intro, ENT_QUOTES, 'UTF-8');
    $brand = htmlspecialchars((string) ($config['from_name'] ?? 'Daniela Rodríguez'), ENT_QUOTES, 'UTF-8');
    $action = '';

    if ($confirmationLink !== '') {
        $safeLink = htmlspecialchars($confirmationLink, ENT_QUOTES, 'UTF-8');
        $action = '<a href="' . $safeLink . '" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#e85c93;color:#fff;text-decoration:none;font-weight:700;">Confirmar o cancelar cita</a>';
    }

    $text = implode("\n\n", array_filter([
        "Hola $customerName,",
        $intro,
        "Servicio: $serviceName",
        "Fecha y hora: " . trim("$date de $start a $end"),
        $confirmationLink !== '' ? "Confirmar o cancelar: $confirmationLink" : '',
        'Gracias por tu preferencia.',
    ]));

    $html = <<<HTML
<div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
  <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
    <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">{$brand}</p>
    <h1 style="margin:8px 0 14px;font-size:28px;color:#18181b;">{$subject}</h1>
    <p>Hola {$safeName},</p>
    <p>{$safeIntro}</p>
    <div style="margin:20px 0;padding:16px;border-radius:18px;background:#fff7fb;border:1px solid #f3d1df;">
      <p style="margin:0 0 8px;"><strong>Servicio:</strong> {$safeService}</p>
      <p style="margin:0;"><strong>Fecha y hora:</strong> {$safeWhen}</p>
    </div>
    {$action}
    <p style="margin-top:24px;color:#71717a;">Gracias por tu preferencia.</p>
  </div>
</div>
HTML;

    return ['subject' => $subject, 'text' => $text, 'html' => $html];
}

function sendSmtpMail(array $config, string $to, string $subject, string $text, string $html): void
{
    $host = (string) $config['host'];
    $port = (int) $config['port'];
    $user = (string) $config['user'];
    $pass = (string) $config['pass'];
    $from = (string) $config['from'];
    $fromName = (string) $config['from_name'];
    $transport = !empty($config['secure']) ? "ssl://$host" : $host;

    $socket = @stream_socket_client($transport . ':' . $port, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        throw new RuntimeException("connect failed: $errstr ($errno)");
    }

    stream_set_timeout($socket, 20);

    try {
        smtpExpect($socket, [220]);
        smtpCommand($socket, 'EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'), [250]);
        smtpCommand($socket, 'AUTH LOGIN', [334]);
        smtpCommand($socket, base64_encode($user), [334]);
        smtpCommand($socket, base64_encode($pass), [235]);
        smtpCommand($socket, 'MAIL FROM:<' . $from . '>', [250]);
        smtpCommand($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtpCommand($socket, 'DATA', [354]);
        fwrite($socket, buildMimeMessage($from, $fromName, $to, $subject, $text, $html) . "\r\n.\r\n");
        smtpExpect($socket, [250]);
        smtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function smtpCommand($socket, string $command, array $expected): string
{
    fwrite($socket, $command . "\r\n");
    return smtpExpect($socket, $expected);
}

function smtpExpect($socket, array $expected): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (preg_match('/^\d{3}\s/', $line)) {
            break;
        }
    }

    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $expected, true)) {
        throw new RuntimeException(trim($response));
    }

    return $response;
}

function buildMimeMessage(string $from, string $fromName, string $to, string $subject, string $text, string $html): string
{
    $boundary = 'crm_' . bin2hex(random_bytes(12));
    $encodedSubject = mimeHeader($subject);
    $encodedFrom = mimeHeader($fromName) . " <$from>";
    $messageId = '<' . bin2hex(random_bytes(12)) . '@' . ($_SERVER['SERVER_NAME'] ?? 'danielarodriguez.nodavexa.com') . '>';

    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . $encodedFrom,
        'To: <' . $to . '>',
        'Subject: ' . $encodedSubject,
        'Message-ID: ' . $messageId,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];

    $parts = [
        implode("\r\n", $headers),
        '',
        '--' . $boundary,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        dotStuff($text),
        '--' . $boundary,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        dotStuff($html),
        '--' . $boundary . '--',
    ];

    return implode("\r\n", $parts);
}

function mimeHeader(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function dotStuff(string $value): string
{
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $lines = explode("\n", $value);
    $lines = array_map(static fn(string $line): string => str_starts_with($line, '.') ? '.' . $line : $line, $lines);
    return implode("\r\n", $lines);
}
