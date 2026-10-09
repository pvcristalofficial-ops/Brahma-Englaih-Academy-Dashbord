<?php
declare(strict_types=1);

namespace App;

/** Thrown anywhere to stop the request with a clean JSON error. */
class HttpException extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly array $fields = [],
        public readonly string $errorCode = '',
        public readonly array $extra = []
    ) {
        parent::__construct($message, $status);
    }

    public static function validation(array $fields, string $message = 'Please correct the highlighted fields.'): self
    {
        return new self(422, $message, $fields, 'validation_failed');
    }
}
