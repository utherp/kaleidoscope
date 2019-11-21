/*******************************************************************************************
 * Livesign v1.0
 * author: Stephen Ecker ~2012
 *
 * This little library (wholely under developed) simply interacts with a server which keeps
 * track of registered signs.  Any browser can register itself as a sign, which allows
 * an administrator the ability to control it's content by loading templates and modifying
 * values within the content.
 *
 * The first thing it does is register.  If the device/browser/etc (cookie controlled) was
 * already registered, then it is told to load it's content in its entirety as XML via 
 * the template library (tmpl.js), which is hooked by the kaleidoscope library (window.js)
 * in order to render and control the content.
 *
 * After the content is loaded, subsequent requests are made to monitor changes to the content.
 * Only the changes are transmitted.  The content tree is climbed to the new value's branch
 * and set via the .value property (which triggers whatever hooks are necessary within
 * the kaleidoscope library).
 *
 * TODO:  describe that whole process much better
 */

window.onload=init_sign;
window.onresize=init_sign;

var _init = false;
function init_sign(reload) {
	if (_init) return;
	_init = true;
	var box = $('<div id="size_test" style="visibility: hidden; height: 10000px; width: 100%;" />');
	$('body').append(box);
	var height=parseInt(window.innerHeight);
	box.get(0).style.height = height + 'px';
	var width=window.innerWidth;
	$('body').empty();
	register_sign(width, height);
	_init = false;
	return;
}

var registered = false;
function register_sign(w, h) {
	var opts = { 'width':w, 'height':h };
	if (!registered) opts.init = 1;
	registered = true;
	$.getJSON('register.php', opts, init_windows);
	load_stream();
}

var loadTimer = false;
function load_stream() {
	clearTimeout(loadTimer);
	loadTimer = setTimeout(load_stream, 2000);
	$.getJSON('stream.php', process);
	return;
}
function jsStyle (name) {
	var tmp = name.split('-');
	var str = tmp[0];
	for (var i = 1; i < tmp.length; i++) {
		var l=tmp[i].substr(0,1).toUpperCase();
		str += l + tmp[i].substr(1);
	}
	return str;
}
function htmlStyle (name) {
	var str = '';
	var tmp = name.split('');
	for (var i = 0; i < tmp.length; i++) {
		if (tmp[i].match(/[A-Z]/))
			tmp[i] = '-' + tmp[i].toLowerCase();
		str += tmp[i];
	}
	return str;
}
function process (data) {
	clearTimeout(loadTimer);
	if (typeof(data) == 'object') for (var i = 0; i < data.length; i++) {
		var ev = data[i];
		var winID = ev.window;
		var win = $('#'+winID).get(0);
		if (!win) continue;
		switch (ev.type) {
			case ('style'):
				if (!ev.duration) ev.duration=1;
				if (!ev.easing) ev.easing='linear';
				var s = {};
				s[htmlStyle(ev.name)] = ev.new;
				$(win).animate(s, {'duration':ev.duration, 'easing':ev.easing, 'queue':false});// = ev.new;
				break;
			case ('attribute'):
				win.setProperty(ev.name, ev.new);
				break;
			case ('value'):
//				$(win).empty();
				set_content.call(win, ev);
				break;
			default:
				break;
		}
	}

	loadTimer = setTimeout(load_stream, 500);
	return;
}

function init_windows (data) {
	if (!data) return;
	for (var i = 0; i < data.length; i++) {
		var w = data[i];
		var str = '<div id="' + w.id + '" ';
		for (var n in w.attributes)
			str += n + '="' + w.properties[n] + '" ';

		var sty = '';
		for (var n in w.styles)
			sty += htmlStyle(n) + ': ' + w.styles[n] + '; ';

		str += 'style="' + sty + '" />';
		var win = $(str);
		var elem = win.get(0);
		elem._type = w.type;
		elem._value = w.value;
		set_content.call(elem);
		$('body').append(win);
	}
}

function set_content (ev) {
	if (!ev) {
		ev = {};
		ev.value = this.new;
        if (!ev.value) ev.value = this._value;
		ev.easing = 'linear';
		ev.duration = 1;
	}
	switch (this._type) {
		case ('text'):
			$(this).empty();
			this.appendChild(document.createTextNode(ev.value));
			break;
		case ('image'):
			var e = this;
			var img = new Image();
			img.style.position = 'absolute';
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.left = '0px';
			img.style.top  = '0px';
			img.style.zIndex = 1;
			img.style.opacity = '0.0';
			img.src = ev.new;
			var en = ev;
			img.onload = function () { 
				var oldimg = $(e).find('img');
				var newimg = img;
				var d = en.duration;
				var ease = en.easing;
				if (oldimg.length) {
					oldimg.get(0).style.zIndex = 30;
					oldimg.animate({'opacity':0.0}, {'duration':d, 'easing':ease, 'queue':false, 'complete':function () { oldimg.remove(); }});
				}
				e.appendChild(img); 
				$(img).animate({'opacity':1}, {'duration':d, 'easing':ease, 'queue':false});
			}
//			elem.appendChild($('<img style="width: 100%; height: 100%" src="' + elem._value + '" />').get(0));
			break;
		default:
			break;
	}
	return this;
}
