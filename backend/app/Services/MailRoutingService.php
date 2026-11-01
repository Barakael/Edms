<?php

namespace App\Services;

use App\Models\Department;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class MailRoutingService
{
    /**
     * Head of Department who receives mail a department member composes.
     */
    public function headOfDepartment(User $member): User
    {
        if (! $member->department_id) {
            throw ValidationException::withMessages([
                'department_id' => 'Your account is not linked to a department.',
            ]);
        }

        $hod = $this->findHeadOfDepartment($member);
        if (! $hod) {
            throw ValidationException::withMessages([
                'department_id' => 'No Head of Department is set for your department.',
            ]);
        }

        return $hod;
    }

    public function findHeadOfDepartment(User $member): ?User
    {
        return $this->hodForDepartmentId($member->department_id ? (int) $member->department_id : null);
    }

    public function headOfDepartmentById(int $departmentId): User
    {
        $hod = $this->hodForDepartmentId($departmentId);
        if (! $hod) {
            throw ValidationException::withMessages([
                'department_id' => 'No Head of Department is set for that department.',
            ]);
        }

        return $hod;
    }

    /**
     * Next desk when the current holder shares along the hierarchy.
     * Staff → HoD inbox; HoD → Preview Box for registry.
     *
     * @return array{box: string, user: ?User, office_id: ?int}
     */
    public function nextHolder(User $sender): array
    {
        if ($sender->role === User::ROLE_STAFF) {
            $hod = $this->hodForDepartmentId($sender->department_id ? (int) $sender->department_id : null);
            if (! $hod) {
                throw ValidationException::withMessages([
                    'share' => 'No Head of Department is set for your department.',
                ]);
            }

            return ['box' => 'inbox', 'user' => $hod, 'office_id' => $hod->office_id];
        }

        if ($sender->role === User::ROLE_HOD) {
            if (! $sender->office_id) {
                throw ValidationException::withMessages([
                    'share' => 'Your account is not linked to a region.',
                ]);
            }

            return ['box' => 'preview', 'user' => null, 'office_id' => (int) $sender->office_id];
        }

        throw ValidationException::withMessages([
            'share' => 'Registry assigns a person from Preview Box.',
        ]);
    }

    /**
     * Direct mail to another department's HoD.
     *
     * @return array{box: string, user: User, office_id: ?int, department: Department}
     */
    public function directToDepartment(int $departmentId): array
    {
        $department = Department::query()->where('active', true)->find($departmentId);
        if (! $department) {
            throw ValidationException::withMessages([
                'department_id' => 'Choose an active department.',
            ]);
        }

        $hod = $this->headOfDepartmentById((int) $department->id);

        return [
            'box' => 'inbox',
            'user' => $hod,
            'office_id' => $hod->office_id ?: $department->office_id,
            'department' => $department,
        ];
    }

    private function hodForDepartmentId(?int $departmentId): ?User
    {
        if (! $departmentId) {
            return null;
        }

        return User::query()
            ->where('role', User::ROLE_HOD)
            ->where('department_id', $departmentId)
            ->where('active', true)
            ->orderBy('id')
            ->first();
    }
}
