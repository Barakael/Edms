<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use PHPOpenSourceSaver\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public const ROLE_REGISTRAR = 'registrar';

    public const ROLE_ACTION_OFFICER = 'action_officer';

    public const ROLE_DIRECTOR = 'director';

    public const ROLE_ADMIN = 'admin';

    public const ROLE_MEMBER = 'member';

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'role',
        'office_id',
        'active',
        'can_download',
        'signature_2fa_enabled',
        'last_login_at',
        'step_up_verified_at',
        'token_version',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'token_version',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
            'can_download' => 'boolean',
            'signature_2fa_enabled' => 'boolean',
            'last_login_at' => 'datetime',
            'step_up_verified_at' => 'datetime',
        ];
    }

    public function getJWTIdentifier(): mixed
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [
            'role' => $this->role,
            'tv' => $this->token_version,
        ];
    }

    public function isRegistrar(): bool
    {
        return $this->role === self::ROLE_REGISTRAR || $this->role === self::ROLE_ADMIN;
    }

    public function isDirector(): bool
    {
        return $this->role === self::ROLE_DIRECTOR;
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function activeSignature(): HasOne
    {
        return $this->hasOne(Signature::class)->whereNull('revoked_at')->latestOfMany();
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(Signature::class);
    }

    public function refreshTokens(): HasMany
    {
        return $this->hasMany(RefreshToken::class);
    }
}
