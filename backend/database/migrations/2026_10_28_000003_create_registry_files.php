<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registry_files', function (Blueprint $table) {
            $table->id();
            $table->string('number')->unique();
            $table->string('name');
            $table->string('status')->default('open')->index();
            $table->foreignId('office_id')->nullable()->constrained('offices')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('retrieved_at')->nullable();
            $table->timestamps();
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->foreignId('registry_file_id')
                ->nullable()
                ->after('office_id')
                ->constrained('registry_files')
                ->nullOnDelete();
        });

        $rows = DB::table('document_registrations')
            ->select('file_number')
            ->whereNotNull('file_number')
            ->where('file_number', '!=', '')
            ->distinct()
            ->pluck('file_number');

        foreach ($rows as $number) {
            $fileId = DB::table('registry_files')->insertGetId([
                'number' => $number,
                'name' => $number,
                'status' => 'open',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $documentIds = DB::table('document_registrations')
                ->where('file_number', $number)
                ->pluck('document_id');

            if ($documentIds->isNotEmpty()) {
                DB::table('documents')
                    ->whereIn('id', $documentIds)
                    ->update(['registry_file_id' => $fileId]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('registry_file_id');
        });
        Schema::dropIfExists('registry_files');
    }
};
