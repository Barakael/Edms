<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // station_id → new/existing department_id under the same office
        $stationToDepartment = [];

        if (Schema::hasTable('stations')) {
            $stations = DB::table('stations')->get();
            foreach ($stations as $station) {
                $existing = DB::table('departments')
                    ->where('office_id', $station->office_id)
                    ->where('name', $station->name)
                    ->first();

                if ($existing) {
                    $stationToDepartment[(int) $station->id] = (int) $existing->id;
                    DB::table('departments')->where('id', $existing->id)->update([
                        'active' => (bool) ($station->active ?? true) || (bool) ($existing->active ?? true),
                        'updated_at' => now(),
                    ]);
                } else {
                    $id = DB::table('departments')->insertGetId([
                        'office_id' => $station->office_id,
                        'station_id' => $station->id,
                        'name' => $station->name,
                        'active' => (bool) ($station->active ?? true),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $stationToDepartment[(int) $station->id] = $id;
                }
            }
        }

        if (Schema::hasColumn('users', 'station_id')) {
            $users = DB::table('users')->whereNotNull('station_id')->get(['id', 'role', 'station_id', 'department_id']);
            foreach ($users as $user) {
                $deptId = $user->department_id
                    ? (int) $user->department_id
                    : ($stationToDepartment[(int) $user->station_id] ?? null);

                $role = $user->role;
                if ($role === 'hos') {
                    $role = 'hod';
                } elseif ($role === 'station_supervisor') {
                    $role = 'staff';
                }

                DB::table('users')->where('id', $user->id)->update([
                    'role' => $role,
                    'department_id' => $deptId,
                    'updated_at' => now(),
                ]);
            }

            // Remap any remaining hos / station_supervisor without station_id
            DB::table('users')->where('role', 'hos')->update(['role' => 'hod', 'updated_at' => now()]);
            DB::table('users')->where('role', 'station_supervisor')->update(['role' => 'staff', 'updated_at' => now()]);
        }

        if (Schema::hasTable('roles')) {
            DB::table('roles')->whereIn('value', ['hos', 'station_supervisor'])->delete();
            DB::table('roles')->where('value', 'hod')->update([
                'description' => 'Receives department mail, manages department staff/files, and can direct mail to other departments or Preview Box.',
                'updated_at' => now(),
            ]);
            DB::table('roles')->where('value', 'staff')->update([
                'description' => 'Submits internal memos and documents to their Head of Department.',
                'updated_at' => now(),
            ]);
        }

        // Drop station FKs / columns
        if (Schema::hasColumn('users', 'station_id')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropConstrainedForeignId('station_id');
            });
        }

        if (Schema::hasColumn('departments', 'station_id')) {
            Schema::table('departments', function (Blueprint $table) {
                $table->dropUnique(['station_id', 'name']);
            });
            Schema::table('departments', function (Blueprint $table) {
                $table->dropConstrainedForeignId('station_id');
            });
        }

        if (Schema::hasTable('stations')) {
            Schema::drop('stations');
        }

        // Ensure unique department name per office (may already exist from early schema)
        try {
            Schema::table('departments', function (Blueprint $table) {
                $table->unique(['office_id', 'name']);
            });
        } catch (\Throwable) {
            // index already present
        }

        if (! Schema::hasColumn('registry_files', 'department_id')) {
            Schema::table('registry_files', function (Blueprint $table) {
                $table->foreignId('department_id')->nullable()->after('office_id')->constrained('departments')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('registry_files', 'department_id')) {
            Schema::table('registry_files', function (Blueprint $table) {
                $table->dropConstrainedForeignId('department_id');
            });
        }

        Schema::create('stations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['office_id', 'name']);
        });

        Schema::table('departments', function (Blueprint $table) {
            try {
                $table->dropUnique(['office_id', 'name']);
            } catch (\Throwable) {
            }
            $table->foreignId('station_id')->nullable()->after('office_id')->constrained('stations')->nullOnDelete();
            $table->unique(['station_id', 'name']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->after('office_id')->constrained('stations')->nullOnDelete();
        });
    }
};
