<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 32)->default('action_officer')->after('email');
            $table->boolean('active')->default(true)->after('role');
            $table->timestamp('last_login_at')->nullable()->after('active');
            $table->timestamp('step_up_verified_at')->nullable()->after('last_login_at');
            $table->unsignedInteger('token_version')->default(0)->after('step_up_verified_at');
        });

        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->string('status', 32)->default('draft')->index();
            $table->string('sensitivity', 32)->default('normal')->index();
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('current_assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });

        Schema::create('document_registrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('mail_subject_type')->nullable()->index();
            $table->string('reference_number')->nullable()->index();
            $table->string('file_number')->nullable()->index();
            $table->string('folio_number')->nullable()->index();
            $table->string('sender_or_origin')->nullable()->index();
            $table->date('received_date')->nullable()->index();
            $table->string('classification')->nullable()->index();
            $table->string('department')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('document_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->string('original_filename');
            $table->string('storage_path');
            $table->string('mime', 128);
            $table->unsignedInteger('page_count')->nullable();
            $table->string('checksum', 64);
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();
        });

        Schema::create('comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('signatures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->longText('ink_data');
            $table->string('capture_source', 64);
            $table->json('device_metadata')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('document_signature_placements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('document_file_id')->constrained('document_files')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('signature_id')->constrained();
            $table->unsignedInteger('page')->default(1);
            $table->decimal('x_pct', 8, 4);
            $table->decimal('y_pct', 8, 4);
            $table->timestamp('placed_at')->useCurrent();
        });

        Schema::create('workflow_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('from_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 64);
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 64);
            $table->string('resource_type', 64)->nullable();
            $table->string('resource_id')->nullable();
            $table->string('ip', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('outcome', 32)->default('success');
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('email_ingest_messages', function (Blueprint $table) {
            $table->id();
            $table->string('message_id')->unique();
            $table->string('from_address')->nullable();
            $table->string('subject')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->string('status', 32)->default('parsed');
            $table->text('raw_refs')->nullable();
            $table->text('failure_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('email_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('email_ingest_message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('document_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 32)->default('pending');
            $table->foreignId('claimed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('refresh_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('signature_capture_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->string('status', 32)->default('pending');
            $table->longText('ink_data')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signature_capture_sessions');
        Schema::dropIfExists('refresh_tokens');
        Schema::dropIfExists('email_drafts');
        Schema::dropIfExists('email_ingest_messages');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('workflow_events');
        Schema::dropIfExists('document_signature_placements');
        Schema::dropIfExists('signatures');
        Schema::dropIfExists('comments');
        Schema::dropIfExists('document_files');
        Schema::dropIfExists('document_registrations');
        Schema::dropIfExists('documents');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['role', 'active', 'last_login_at', 'step_up_verified_at', 'token_version']);
        });
    }
};
