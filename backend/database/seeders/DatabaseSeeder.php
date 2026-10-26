<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Office;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $office = Office::query()->updateOrCreate(
            ['name' => 'Head Office'],
            ['active' => true]
        );

        foreach (['Registry', 'Finance', 'Procurement', 'Legal', 'Operations'] as $name) {
            Department::query()->updateOrCreate(
                ['office_id' => $office->id, 'name' => $name],
                ['active' => true]
            );
        }

        User::query()->updateOrCreate(
            ['email' => 'registrar@edms.local'],
            [
                'name' => 'Registry Officer',
                'phone' => '+255700000001',
                'password' => Hash::make('password'),
                'role' => User::ROLE_REGISTRAR,
                'active' => true,
                'can_download' => true,
            ]
        );

        User::query()->updateOrCreate(
            ['email' => 'officer@edms.local'],
            [
                'name' => 'Action Officer One',
                'phone' => '+255700000002',
                'password' => Hash::make('password'),
                'role' => User::ROLE_ACTION_OFFICER,
                'active' => true,
                'can_download' => false,
            ]
        );

        User::query()->updateOrCreate(
            ['email' => 'officer2@edms.local'],
            [
                'name' => 'Action Officer Two',
                'phone' => '+255700000003',
                'password' => Hash::make('password'),
                'role' => User::ROLE_ACTION_OFFICER,
                'active' => true,
                'can_download' => false,
            ]
        );

        User::query()->updateOrCreate(
            ['email' => 'director@edms.local'],
            [
                'name' => 'Director General',
                'phone' => '+255700000004',
                'password' => Hash::make('password'),
                'role' => User::ROLE_DIRECTOR,
                'active' => true,
                'can_download' => false,
            ]
        );

        User::query()->updateOrCreate(
            ['email' => 'member@edms.local'],
            [
                'name' => 'Staff Member',
                'phone' => '+255700000005',
                'password' => Hash::make('password'),
                'role' => User::ROLE_MEMBER,
                'active' => true,
                'can_download' => false,
            ]
        );
    }
}
