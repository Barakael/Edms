<?php

namespace App\Services\Sms;

class NullSmsSender implements SmsSender
{
    public function send(string $toPhone, string $message): bool
    {
        return false;
    }
}
