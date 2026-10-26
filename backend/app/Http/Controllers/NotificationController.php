<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $unread = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        $items = AppNotification::query()
            ->with(['document.registration:id,document_id,reference_number'])
            ->where('user_id', $user->id)
            ->orderByDesc('id')
            ->limit(30)
            ->get();

        return response()->json([
            'unread_count' => $unread,
            'items' => $items,
        ]);
    }

    public function markRead(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'all' => ['sometimes', 'boolean'],
        ]);

        $query = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at');

        if (! empty($data['all'])) {
            // mark all
        } elseif (! empty($data['ids'])) {
            $query->whereIn('id', $data['ids']);
        } else {
            $query->whereRaw('1 = 0');
        }

        $query->update(['read_at' => now()]);

        $unread = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json(['unread_count' => $unread]);
    }
}
