<?php

namespace App\Services\Sms;

interface SmsSender
{
    public function send(string $toPhone, string $message): bool;
}
