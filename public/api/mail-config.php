<?php

return [
    'host' => getenv('SMTP_HOST') ?: 'smtp.hostinger.com',
    'port' => (int) (getenv('SMTP_PORT') ?: 465),
    'secure' => filter_var(getenv('SMTP_SECURE') ?: 'true', FILTER_VALIDATE_BOOLEAN),
    'user' => getenv('SMTP_USER') ?: '',
    'pass' => getenv('SMTP_PASS') ?: '',
    'from' => getenv('SMTP_FROM') ?: (getenv('SMTP_USER') ?: ''),
    'from_name' => getenv('SMTP_FROM_NAME') ?: 'Daniela Rodríguez',
];
