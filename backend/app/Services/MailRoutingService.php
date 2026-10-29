<?php

namespace App\Services;

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
        return $this->hodFor($member);
    }

    /**
     * Head of Station who receives an internal memo from a station supervisor.
     */
    public function headOfStation(User $member): User
    {
        if (! $member->station_id) {
            throw ValidationException::withMessages([
                'station_id' => 'Your account is not linked to a station.',
            ]);
        }

        $hos = $this->findHeadOfStation($member);
        if (! $hos) {
            throw ValidationException::withMessages([
                'station_id' => 'No Head of Station is set for your station.',
            ]);
        }

        return $hos;
    }

    public function findHeadOfStation(User $member): ?User
    {
        return $this->hosFor($member);
    }

    /**
     * Next desk when the current holder shares along the region hierarchy.
     *
     * @return array{box: string, user: ?User, office_id: ?int}
     */
    public function nextHolder(User $sender): array
    {
        if ($sender->role === User::ROLE_STAFF) {
            $hod = $this->hodFor($sender);
            if ($hod) {
                return ['box' => 'inbox', 'user' => $hod, 'office_id' => $hod->office_id];
            }

            $hos = $this->hosFor($sender);
            if (! $hos) {
                throw ValidationException::withMessages([
                    'share' => 'No Head of Department or Head of Station is set for your station.',
                ]);
            }

            return ['box' => 'inbox', 'user' => $hos, 'office_id' => $hos->office_id];
        }

        if ($sender->role === User::ROLE_HOD || $sender->role === User::ROLE_STATION_SUPERVISOR) {
            $hos = $this->hosFor($sender);
            if (! $hos) {
                throw ValidationException::withMessages([
                    'share' => 'No Head of Station is set for your station.',
                ]);
            }

            return ['box' => 'inbox', 'user' => $hos, 'office_id' => $hos->office_id];
        }

        if ($sender->role === User::ROLE_HOS) {
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

    private function hodFor(User $sender): ?User
    {
        if (! $sender->department_id) {
            return null;
        }

        return User::query()
            ->where('role', User::ROLE_HOD)
            ->where('department_id', $sender->department_id)
            ->where('active', true)
            ->orderBy('id')
            ->first();
    }

    private function hosFor(User $sender): ?User
    {
        if (! $sender->station_id) {
            return null;
        }

        return User::query()
            ->where('role', User::ROLE_HOS)
            ->where('station_id', $sender->station_id)
            ->where('active', true)
            ->orderBy('id')
            ->first();
    }
}
