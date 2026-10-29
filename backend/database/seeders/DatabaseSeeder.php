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
        $tanzania = Office::query()->updateOrCreate(['name' => 'Tanzania'], ['active' => true]);
        Office::query()->updateOrCreate(['name' => 'Zambia'], ['active' => true]);

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
            ['email' => 'registrar@edms.local', 'name' => 'Registry Officer', 'phone' => '+255700000001', 'role' => User::ROLE_REGISTRAR, 'can_download' => true, 'office' => 'head'],
            ['email' => 'officer@edms.local', 'name' => 'Staff One', 'phone' => '+255700000002', 'role' => User::ROLE_STAFF, 'can_download' => false, 'office' => 'tz'],
            ['email' => 'officer2@edms.local', 'name' => 'Staff Two', 'phone' => '+255700000003', 'role' => User::ROLE_STAFF, 'can_download' => false, 'office' => 'tz'],
            ['email' => 'director@edms.local', 'name' => 'Senior Manager', 'phone' => '+255700000004', 'role' => User::ROLE_SENIOR_MANAGER, 'can_download' => false, 'office' => 'tz'],
            ['email' => 'member@edms.local', 'name' => 'Staff Member', 'phone' => '+255700000005', 'role' => User::ROLE_STAFF, 'can_download' => false, 'office' => 'tz'],
        ];

        foreach ($people as $person) {
            User::query()->updateOrCreate(
                ['email' => $person['email']],
                [
                    'name' => $person['name'],
                    'phone' => $person['phone'],
                    'password' => Hash::make('password'),
                    'role' => $person['role'],
                    'office_id' => $person['office'] === 'tz' ? $tanzania->id : $office->id,
                    'active' => true,
                    'can_download' => $person['can_download'],
                ]
            );
        }
    }
}
