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

    public const ROLE_STAFF = 'staff';

    public const ROLE_SENIOR_MANAGER = 'senior_manager';

    public const ROLE_HOD = 'hod';

    public const ROLE_ADMIN = 'admin';

    /** @deprecated Remapped to hod */
    public const ROLE_HOS = 'hos';

    /** @deprecated Remapped to staff */
    public const ROLE_STATION_SUPERVISOR = 'station_supervisor';

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'role',
        'office_id',
        'department_id',
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

    public function isSeniorManager(): bool
    {
        return $this->role === self::ROLE_SENIOR_MANAGER;
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    /** @return list<string> */
    public static function assignableRoles(): array
    {
        $values = Role::query()->orderBy('id')->pluck('value')->all();
        if ($values !== []) {
            return $values;
        }

        return array_column(self::fallbackRoleCatalog(), 'value');
    }

    /**
     * Roles available for administration and assignment.
     *
     * @return list<array{value: string, label: string, description: string}>
     */
    public static function roleCatalog(): array
    {
        $rows = Role::query()->orderBy('id')->get(['value', 'label', 'description']);
        if ($rows->isNotEmpty()) {
            return $rows->map(static fn (Role $role) => [
                'value' => $role->value,
                'label' => $role->label,
                'description' => $role->description ?? '',
            ])->all();
        }

        return self::fallbackRoleCatalog();
    }

    /**
     * @return list<array{value: string, label: string, description: string}>
     */
    private static function fallbackRoleCatalog(): array
    {
        return [
            [
                'value' => self::ROLE_ADMIN,
                'label' => 'System admin',
                'description' => 'Full system access, including administration.',
            ],
            [
                'value' => self::ROLE_REGISTRAR,
                'label' => 'Registry',
                'description' => 'Registers mail, manages files, and routes work.',
            ],
            [
                'value' => self::ROLE_SENIOR_MANAGER,
                'label' => 'Senior manager',
                'description' => 'Sees Preview Box and archives for the region.',
            ],
            [
                'value' => self::ROLE_HOD,
                'label' => 'Head of department',
                'description' => 'Receives department mail, manages department staff/files, and can direct mail to other departments.',
            ],
            [
                'value' => self::ROLE_STAFF,
                'label' => 'Staff',
                'description' => 'Submits internal memos and documents to their Head of Department.',
            ],
        ];
    }

    public function seesAllDepartments(): bool
    {
        return $this->isRegistrar() || $this->isSeniorManager();
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
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
