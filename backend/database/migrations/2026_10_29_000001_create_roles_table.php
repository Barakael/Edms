<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('value', 64)->unique();
            $table->string('label');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        $now = now();
        DB::table('roles')->insert([
            [
                'value' => 'admin',
                'label' => 'System admin',
                'description' => 'Full system access, including administration.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'registrar',
                'label' => 'Registry',
                'description' => 'Registers mail, manages files, and routes work.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'senior_manager',
                'label' => 'Senior manager',
                'description' => 'Sees Preview Box and archives for the region.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'hos',
                'label' => 'Head of station',
                'description' => 'Receives station mail and shares into Preview Box.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'station_supervisor',
                'label' => 'Station supervisor',
                'description' => 'Sends internal memos to the Head of Station.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'hod',
                'label' => 'Head of department',
                'description' => 'Receives department staff mail and shares to Head of Station.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'value' => 'staff',
                'label' => 'Staff',
                'description' => 'Submits mail to their Head of Department.',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
