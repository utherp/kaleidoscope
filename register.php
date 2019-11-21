<?php
	require_once('/usr/local/livesign/etc/livesign.php');

	$w = $_REQUEST['width'];
	$h = $_REQUEST['height'];
	$ipaddr = $_SERVER['REMOTE_ADDR'];

	$sign = new sign();
	$sign->load(array('ipaddr'=>$ipaddr));
//	print_r($sign);
	if (!$sign->is_loaded())
		$sign->ipaddr = $ipaddr;

	$sign->width = $w;
	$sign->height = $h;
	$sign->save();

	@session_start();
	$_SESSION['sign'] = $sign;

	if ($_REQUEST['init']) {
		print '[';
		$f = false;
		foreach ($sign->windows as $w) {
			if ($f) print ','; else $f = true;
			print $w;
		}
		print ']';
	}
