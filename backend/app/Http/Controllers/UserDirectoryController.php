<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserDirectoryController extends Controller
{
    public function assignees(Request $request): JsonResponse
    {
        $users = User::query()
            ->where('active', true)
            ->whereIn('role', User::assignableRoles())
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'phone', 'role']);

        return response()->json(['users' => $users]);
    }
}
