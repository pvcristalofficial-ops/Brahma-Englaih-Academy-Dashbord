<?php
/**
 * Copy this file to config.php and fill in your details.
 * config.php is NEVER committed to git (see .gitignore) and is blocked from the web by .htaccess.
 */
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'your_database_name',
        'user' => 'your_database_user',
        'pass' => 'your_database_password',
    ],
    'app' => [
        'debug'    => false,              // keep false on the live server
        'timezone' => 'Asia/Kolkata',

        // One-time installer password (used by setup.php). Use 16+ random characters.
        'setup_key' => 'CHANGE-ME-TO-A-LONG-RANDOM-TEXT',

        // Website form (optional). Leave '' to disable the public endpoint.
        // Put the same value in your website form as the hidden "key" field.
        'public_form_key'     => '',
        'public_form_origins' => ['https://brahmaenglishacademy.com', 'https://www.brahmaenglishacademy.com'],

        // Set true only if the site is behind a trusted proxy / Cloudflare (to read the real visitor IP).
        'trust_proxy' => false,
    ],
];
