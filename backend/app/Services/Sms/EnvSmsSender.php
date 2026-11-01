<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Sends SMS via eHub (HMAC-signed API), matching TeraText / Messaging.
 */
class EnvSmsSender implements SmsSender
{
    public function send(string $toPhone, string $message): bool
    {
        if (! filter_var(config('edms.sms.enabled'), FILTER_VALIDATE_BOOLEAN)) {
            return false;
        }

        $provider = (string) config('edms.sms.provider', 'ehub');
        if ($provider !== 'ehub') {
            Log::warning('rDMS-HQ SMS: unsupported provider', ['provider' => $provider]);

            return false;
        }

        $apiKey = (string) config('edms.sms.api_key');
        $apiSecret = (string) config('edms.sms.api_secret');
        $apiUrl = rtrim((string) config('edms.sms.api_url'), '/');
        $senderId = (string) config('edms.sms.sender_id');
        $countryCode = (string) config('edms.sms.country_code', '255');
        $fromLabel = (string) config('edms.sms.from', 'TiketFasta');

        if ($apiKey === '' || $apiSecret === '' || $apiUrl === '' || $senderId === '') {
            Log::error('rDMS-HQ SMS: missing eHub credentials or EHUB_SENDER_ID');

            return false;
        }

        $to = $this->normalizePhone($toPhone, $countryCode);
        if (! preg_match('/^'.preg_quote($countryCode, '/').'\d{9}$/', $to)) {
            Log::warning('rDMS-HQ SMS: invalid destination number', [
                'to' => $toPhone,
                'normalized' => $to,
                'from' => $fromLabel,
            ]);

            return false;
        }

        $path = '/api/v1/sms/send';
        $payload = [
            'to' => $to,
            'message' => $this->sanitizeMessage($message),
            'sender_id' => $senderId,
        ];

        $encodedBody = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (! is_string($encodedBody)) {
            Log::error('rDMS-HQ SMS: failed to encode payload');

            return false;
        }

        $timestamp = (string) time();
        $signaturePayload = $timestamp."\nPOST\n".$path."\n".$encodedBody;
        $signature = hash_hmac('sha256', $signaturePayload, $apiSecret);

        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
                'Authorization' => 'Bearer '.$apiKey,
                'Content-Type' => 'application/json',
                'X-Timestamp' => $timestamp,
                'X-Signature' => $signature,
            ])->withBody($encodedBody, 'application/json')
                ->post($apiUrl.'/sms/send');

            $body = $response->json() ?? [];
            $ok = $response->successful() && (bool) ($body['success'] ?? false);

            if (! $ok) {
                Log::warning('rDMS-HQ SMS: eHub send failed', [
                    'status' => $response->status(),
                    'to' => $to,
                    'from' => $fromLabel,
                    'sender_id' => $senderId,
                    'body' => $body,
                ]);

                return false;
            }

            Log::info('rDMS-HQ SMS: eHub send ok', [
                'to' => $to,
                'from' => $fromLabel,
                'sender_id' => $senderId,
                'message_id' => data_get($body, 'data.message_id'),
            ]);

            return true;
        } catch (Throwable $e) {
            Log::error('rDMS-HQ SMS: eHub request exception', [
                'to' => $to,
                'from' => $fromLabel,
                'message' => $e->getMessage(),
            ]);

            return false;
        }
    }

    private function normalizePhone(string $phone, string $countryCode): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if (str_starts_with($digits, '0')) {
            return $countryCode.substr($digits, 1);
        }

        if (! str_starts_with($digits, $countryCode)) {
            return $countryCode.$digits;
        }

        return $digits;
    }

    private function sanitizeMessage(string $body): string
    {
        $body = str_replace(
            ["\u{2018}", "\u{2019}", "\u{201C}", "\u{201D}", "\u{2013}", "\u{2014}", "\u{00A0}"],
            ["'", "'", '"', '"', '-', '-', ' '],
            $body
        );

        $body = preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/u', '', $body) ?? $body;

        return trim($body);
    }
}
