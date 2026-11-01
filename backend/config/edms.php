<?php

return [
    'step_up_minutes' => (int) env('EDMS_STEP_UP_MINUTES', 15),
    'access_token_ttl_minutes' => (int) env('EDMS_ACCESS_TTL_MINUTES', 30),
    'refresh_token_days' => (int) env('EDMS_REFRESH_DAYS', 14),
    'max_concurrent_sessions' => (int) env('EDMS_MAX_SESSIONS', 5),
    'idle_timeout_minutes' => (int) env('EDMS_IDLE_TIMEOUT_MINUTES', 60),
    'email_mailbox' => env('EDMS_EMAIL_MAILBOX', 'info@example.com'),
    'storage_disk' => env('EDMS_STORAGE_DISK', 'edms'),
    'email_ingest_secret' => env('EDMS_EMAIL_INGEST_SECRET'),
    'app_url' => env('EDMS_APP_URL', env('APP_URL', 'http://localhost:5173')),
    'otp_ttl_seconds' => (int) env('OTP_TTL_SECONDS', 120),
    'sms' => [
        'enabled' => filter_var(env('SMS_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
        'provider' => env('SMS_PROVIDER', 'ehub'),
        'api_key' => env('SMS_API_KEY'),
        'api_secret' => env('SMS_API_SECRET', env('SMS_SECRET_KEY')),
        'api_url' => rtrim((string) env('SMS_API_URL', 'https://sms.ehub.co.tz/api/v1'), '/'),
        'sender_id' => env('EHUB_SENDER_ID', 'HABARI'),
        'from' => env('SMS_FROM', 'HABARI'),
        'country_code' => env('SMS_COUNTRY_CODE', '255'),
    ],
];
