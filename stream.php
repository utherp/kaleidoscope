<?php
	require_once('/usr/local/livesign/etc/livesign.php');
    header('content-type', 'application/json');
	@session_start();
	$sign = $_SESSION['sign'];
	if (!$sign) exit;

	print json_encode($sign->changes);

