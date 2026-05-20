<?php
$file = $_GET['file'] ?? '';
$allowed = ['TimeFlow.dmg', 'TimeFlow-Intel.dmg', 'TimeFlow-ARM.dmg'];

if (!in_array($file, $allowed) || !file_exists($file)) {
    http_response_code(404);
    exit('File not found');
}

// Force download with proper headers
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . basename($file) . '"');
header('Content-Length: ' . filesize($file));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

// Output file
readfile($file);
exit;
?>
