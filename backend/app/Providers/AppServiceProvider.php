<?php

namespace App\Providers;

use App\Services\Sms\EnvSmsSender;
use App\Services\Sms\NullSmsSender;
use App\Services\Sms\SmsSender;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(SmsSender::class, function () {
            if (filter_var(config('edms.sms.enabled'), FILTER_VALIDATE_BOOLEAN)) {
                return new EnvSmsSender;
            }

            return new NullSmsSender;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
