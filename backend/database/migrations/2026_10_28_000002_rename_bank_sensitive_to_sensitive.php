<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('documents')
            ->where('sensitivity', 'bank_sensitive')
            ->update(['sensitivity' => 'sensitive']);
    }

    public function down(): void
    {
        DB::table('documents')
            ->where('sensitivity', 'sensitive')
            ->update(['sensitivity' => 'bank_sensitive']);
    }
};
