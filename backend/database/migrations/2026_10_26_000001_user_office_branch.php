<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('office_id')->nullable()->after('role')->constrained('offices')->nullOnDelete();
        });

        $officeId = DB::table('offices')->orderBy('id')->value('id');
        if ($officeId) {
            DB::table('users')->whereNull('office_id')->update(['office_id' => $officeId]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('office_id');
        });
    }
};
