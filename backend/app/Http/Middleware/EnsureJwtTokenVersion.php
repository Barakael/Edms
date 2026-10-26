<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use PHPOpenSourceSaver\JWTAuth\Facades\JWTAuth;
use Symfony\Component\HttpFoundation\Response;

class EnsureJwtTokenVersion
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user) {
            try {
                $payload = JWTAuth::parseToken()->getPayload();
                $tv = (int) $payload->get('tv', 0);
                if ($tv !== (int) $user->token_version) {
                    return response()->json(['message' => 'Session revoked.'], 401);
                }
            } catch (\Throwable) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            if (! $user->active) {
                return response()->json(['message' => 'Account inactive.'], 401);
            }
        }

        return $next($request);
    }
}
