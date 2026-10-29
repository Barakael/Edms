<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['office_id', 'name']);
        });

        Schema::table('departments', function (Blueprint $table) {
            $table->dropUnique(['office_id', 'name']);
            $table->foreignId('station_id')->nullable()->after('office_id')->constrained('stations')->nullOnDelete();
            $table->unique(['station_id', 'name']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('station_id')->nullable()->after('office_id')->constrained('stations')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->after('station_id')->constrained('departments')->nullOnDelete();
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->string('box', 32)->default('inbox')->index()->after('status');
            $table->timestamp('locked_at')->nullable()->after('closed_at');
            $table->foreignId('office_id')->nullable()->after('created_by')->constrained('offices')->nullOnDelete();
        });

        Schema::table('document_registrations', function (Blueprint $table) {
            $table->string('mail_type')->nullable()->after('mail_subject_type')->index();
            $table->string('mail_subject')->nullable()->after('mail_type')->index();
            $table->string('mail_priority', 32)->default('normal')->after('classification')->index();
            $table->string('volume')->nullable()->after('mail_priority');
        });

        Schema::create('comment_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('comment_id')->constrained()->cascadeOnDelete();
            $table->string('original_filename');
            $table->string('storage_path');
            $table->string('mime', 128);
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();
        });

        DB::table('users')->where('role', 'director')->update(['role' => 'senior_manager']);
        DB::table('users')->whereIn('role', ['member', 'action_officer'])->update(['role' => 'staff']);

        DB::table('documents')->where('status', 'closed')->update(['box' => 'archive']);
        DB::table('documents')
            ->where('status', '!=', 'closed')
            ->where(function ($q) {
                $q->where('awaiting_registry', true)
                    ->orWhere('status', 'pending_registry')
                    ->orWhere('status', 'draft')
                    ->orWhereNull('current_assignee_id');
            })
            ->update(['box' => 'preview']);

        DB::table('document_registrations')
            ->whereNull('mail_subject')
            ->whereNotNull('mail_subject_type')
            ->update(['mail_subject' => DB::raw('mail_subject_type')]);

        $now = now();
        foreach (['Tanzania', 'Zambia'] as $name) {
            $exists = DB::table('offices')->where('name', $name)->exists();
            if (! $exists) {
                DB::table('offices')->insert([
                    'name' => $name,
                    'active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_attachments');

        Schema::table('document_registrations', function (Blueprint $table) {
            $table->dropColumn(['mail_type', 'mail_subject', 'mail_priority', 'volume']);
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('office_id');
            $table->dropColumn(['box', 'locked_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('department_id');
            $table->dropConstrainedForeignId('station_id');
        });

        Schema::table('departments', function (Blueprint $table) {
            $table->dropUnique(['station_id', 'name']);
            $table->dropConstrainedForeignId('station_id');
            $table->unique(['office_id', 'name']);
        });

        Schema::dropIfExists('stations');

        DB::table('users')->where('role', 'senior_manager')->update(['role' => 'director']);
        DB::table('users')->where('role', 'staff')->update(['role' => 'action_officer']);
    }
};
