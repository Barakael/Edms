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

        foreach (['Registry', 'Finance', 'Procurement', 'Legal', 'Operations', 'IT'] as $name) {
            Department::query()->updateOrCreate(
                ['office_id' => $office->id, 'name' => $name],
                ['active' => true]
            );
        }

        $itDept = Department::query()->where('office_id', $office->id)->where('name', 'IT')->first();
        $opsDept = Department::query()->where('office_id', $office->id)->where('name', 'Operations')->first();

        $people = [
            [
                'email' => 'it@tazama.co.tz',
                'name' => 'IT Admin',
                'phone' => '+255700000001',
                'role' => User::ROLE_ADMIN,
                'can_download' => true,
                'office_id' => $office->id,
                'department_id' => null,
            ],
            [
                'email' => 'registrar@edms.local',
                'name' => 'Registry Officer',
                'phone' => '+255700000011',
                'role' => User::ROLE_REGISTRAR,
                'can_download' => true,
                'office_id' => $office->id,
                'department_id' => null,
            ],
            [
                'email' => 'officer@edms.local',
                'name' => 'Staff One',
                'phone' => '+255700000002',
                'role' => User::ROLE_STAFF,
                'can_download' => false,
                'office_id' => $tanzania->id,
                'department_id' => $opsDept?->id,
            ],
            [
                'email' => 'officer2@edms.local',
                'name' => 'Staff Two',
                'phone' => '+255700000003',
                'role' => User::ROLE_STAFF,
                'can_download' => false,
                'office_id' => $tanzania->id,
                'department_id' => $opsDept?->id,
            ],
            [
                'email' => 'director@edms.local',
                'name' => 'Senior Manager',
                'phone' => '+255700000004',
                'role' => User::ROLE_SENIOR_MANAGER,
                'can_download' => false,
                'office_id' => $tanzania->id,
                'department_id' => null,
            ],
            [
                'email' => 'member@edms.local',
                'name' => 'Staff Member',
                'phone' => '+255700000005',
                'role' => User::ROLE_STAFF,
                'can_download' => false,
                'office_id' => $tanzania->id,
                'department_id' => $opsDept?->id,
            ],
            [
                'email' => 'hod@edms.local',
                'name' => 'Head of Operations',
                'phone' => '+255700000006',
                'role' => User::ROLE_HOD,
                'can_download' => false,
                'office_id' => $office->id,
                'department_id' => $opsDept?->id,
            ],
        ];

        foreach ($people as $person) {
            User::query()->updateOrCreate(
                ['email' => $person['email']],
                [
                    'name' => $person['name'],
                    'phone' => $person['phone'],
                    'password' => Hash::make('password'),
                    'role' => $person['role'],
                    'office_id' => $person['office_id'],
                    'department_id' => $person['department_id'],
                    'active' => true,
                    'can_download' => $person['can_download'],
                ]
            );
        }

        // Ensure IT admin exists even if email was previously seeded as registrar
        User::query()->updateOrCreate(
            ['email' => 'it@tazama.co.tz'],
            [
                'name' => 'IT Admin',
                'phone' => '+255700000001',
                'password' => Hash::make('password'),
                'role' => User::ROLE_ADMIN,
                'office_id' => $office->id,
                'department_id' => $itDept?->id,
                'active' => true,
                'can_download' => true,
            ]
        );
    }
}
