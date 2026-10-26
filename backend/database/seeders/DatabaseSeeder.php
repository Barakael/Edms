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

        $people = [
            ['email' => 'registrar@edms.local', 'name' => 'Registry Officer', 'phone' => '+255700000001', 'role' => User::ROLE_REGISTRAR, 'can_download' => true],
            ['email' => 'officer@edms.local', 'name' => 'Action Officer One', 'phone' => '+255700000002', 'role' => User::ROLE_ACTION_OFFICER, 'can_download' => false],
            ['email' => 'officer2@edms.local', 'name' => 'Action Officer Two', 'phone' => '+255700000003', 'role' => User::ROLE_ACTION_OFFICER, 'can_download' => false],
            ['email' => 'director@edms.local', 'name' => 'Director General', 'phone' => '+255700000004', 'role' => User::ROLE_DIRECTOR, 'can_download' => false],
            ['email' => 'member@edms.local', 'name' => 'Staff Member', 'phone' => '+255700000005', 'role' => User::ROLE_MEMBER, 'can_download' => false],
        ];

        foreach ($people as $person) {
            User::query()->updateOrCreate(
                ['email' => $person['email']],
                [
                    'name' => $person['name'],
                    'phone' => $person['phone'],
                    'password' => Hash::make('password'),
                    'role' => $person['role'],
                    'office_id' => $office->id,
                    'active' => true,
                    'can_download' => $person['can_download'],
                ]
            );
        }
    }
}
