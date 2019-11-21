/*********************************************************************************************
 * Kaleidoscope Signage Windowing library
 *   version: 1.0
 *    author: Stephen Ecker 
 *      date: ~2012
 *     
 * This library actually contains 4 main parts described below, some stack/extend others.
 * Hooks are registered with the tmpl library (js/tmpl.js) which loads and parses the XML,
 * and calls into this library to handle the tags it finds.  The tags and attribtues are
 * are handled by one or more of the prototypes described below.
 *
 * see below for a *minimal* example template
 *
 *  Positionable:
 *      This prototype implements all the get/set hooks for positioning and sizing
 *      an element by way of setting:  .x, .y, .z, .w, and .h.
 *      It is meant to effectively simplify the CSS positioning system.
 *
 *  Window:
 *      This is the main prototype for signage 'windows' and extends Positionable
 *      and Scheduler.Sequence (see timer.js).  A window has a size and position
 *      (Positionable), Skew and duration (Scheduler.Sequence),
 *      a border (Border), a margin (Margin), content (Content) effects (Effect)
 *      and sub-windows.  A window may contain any number of sub-windows, but only
 *      ONE content item.  If you need more content items, make sub-windows.
 *
 *  Effect:
 *      This prototype is for effects/transition processing which utilizes the
 *      Sequences (see timer.js).  All tags which extend the sequencer can support
 *      effects.  This effects library differs from jQuery's effects in that
 *      jQuery can only transistion *certain* css styles.  This allows transitioning
 *      of *any* and *all* properties.  Since positioning is overridden with Positionable
 *      (i.e. (left|right) is utilized by .x, (top|bottom) is used by .y, z-index by .z,
 *      and (width|height) is .w and .h).  Thus to use an easing function to adjust the
 *      width of a window, you simply create an Effect tag indicating the easing method,
 *      and the property 'x', when it should start and how long it should take.
 *
 *  Content:
 *      This prototype handles a window's primary content and is determined by one of 
 *      the content tags, currently including one of the types below.  A window's content
 *      object can be changed by simply setting the .value property (window.value = 'something.jpg').
 *      Since the content type is automatically determined by the value, this can potentially change
 *      the window's content type.  Exceptions to this are 'markup', 'paragraph' and 'style'.  This
 *      is because those types use subsequence values for alteration.
 *      Supported tags are align, valign (content alignment within window), style (additional css 
 *      styles), type (the content type, when no override tag is bound), whenSet (a callback which
 *      is run when the value is set/changed) and value (the default value)
 *
 *      Types:
 *           image:  An image, the url is found in the value attribute or the tag's content
 *
 *            text:  Simple text
 *
 *       paragraph:  Identical to text except it implements the 'paragraph' css class
 *
 *          markup:  The markup type's content is inserted as-is, except that all
 *                   instances if $value within are translated to the actual value
 *                   set on the window: 
 *                   i.e.: XML = <window><markup>This content $value marked up</markup></window>
 *                     theWindow.value = 'is';  // now the window contains "This content is marked up"
 *                     theWindow.value = 'was'; // now the window containt "This content was marked up"
 *
 *           style:  This type signifies a css style name to which the window's value is applied 
 *                   i.e.: XML = <window><style target="opacity">90%</style></window>
 *                     theWindow.value = '50%';  // now the window's opacity is 50%
 *
 *           video:  A video url is specified in the value attribute or the tag's content.  The video is loaded and played in the window box.
 *                   NOTE: this requires HTML5 support (because I'm not wasting my time for backward compatibility in this case). 
 *
 *            tmpl:  This content type refers to a sub-template which is loaded, processed and inserted into this window as if it were inline in the XML
 *
 *  Color:
 *      This prototype translates the various ways of indicating color (rgb, hex, named, etc..) and derives a standard way of utilizing them.
 *
 *  Font:
 *      This prototype translates font specs into css styles and applies them to the window.  Font specs cascade to all child windows.
 *
 *  Border: 
 *      This prototype translates border specs into css styles.  A border tag is found inside a window tag, and contains the attribtues 'width', 'color', and 'margin'.  The margin is 
 *      between the window's width and the border itself.  If the window also has a margin, it is between the border and it's content.
 *
 *  Margin:
 *      This prototype translates margin specs into css styles and applies them to the window or border.
 *
 *
 * TODO:  finish implementing transitions
 * TODO:  determine how to handle premature cancelation and/or pausing of the clock
 * TODO:  write a more complete example template
 *
 *
 * EXAMPLE TEMPLATE:
 *
 * <?xml version="1.0" encoding="UTF-8"?>
 * <window name='demo' x="100" y="50" z="1" width="600" height="300" duration="5000" margin="2" align='center' valign='middle'>
 *     <color bg="DarkSlateGray" fg="White" />
 * 
 *     <border width="2" color="#FF7F00" margin="1" />
 * 
 *     <content id='demoContent' type='text'>NOTE: this content is 'escaped' UTF-8 encoding %E2%83%95%E3%83%AA%E3%83%BC%E7%99%BE%E7%A7%91%E4%BA%8B%E5%85%B8</content>
 * 
 *     <effect name='scroll in out left' offset="0%" duration="100%" runtime='40%' gap='10%'>
 *         <effect name='scroll in left'  offset='0%' duration='40%' />
 *         <effect name='blinking' offset='+0' duration='20%' runtime='1000' >
 *             <effect name='blink out' duration='50%' />
 *             <effect name='blink in' offset='+0' duration='50%' />
 *         </effect>
 *         <effect name='scroll out left' offset='+500' duration='40%' />
 *     </effect>
 * 
 * 
 *     <window x='10%' y='5%' z='2' width='100' height='30'>
 *         <border width='1' color='blue' margin='1' />
 *         <content align='right' valign='bottom'>blah blah</content>
 *     </window>
 * 
 *     <window x='20%' y='+10%' z='+1' width='120' height='20'>
 *         <border width='2' color='green' margin='2' />
 *         <content align='center' valign='bottom'>farkle</content>
 *     </window>
 * 
 * </window>
 *
 */

(function (_w) {
    var window = _w, undefined,

    all_windows = {},
    next_rand_win_id = 0,

    WindowWrapper = window.Window = function (props) {
        if (typeof(props) == 'string') {
            var tmp = props.split('.');
            var win = all_windows[tmp[0]];
            if (!win) return false;
            if (win.content && win.content.type == 'tmpl') win = win.content.value;
            for (var i = 1; i < tmp.length; i++) {
                var m = false;
                for (var x = 0; x < win.children.length; x++) {
                    if (win.children[x].name == tmp[i]) {
                        m = win.children[x];
                        if (m.content && m.content.type == 'tmpl') m = m.content.value;
                        break;
                    }
                }
                if (!m) return false;
                win = m;
            }
            return win;
        }
        if (!props) return false;
        if (typeof(props) != 'object')
            return all_windows[props];

        var win = new Window(props);
        all_windows[win.name] = win;
        return win;
    };

/******************************************************************************/

    function Positionable () { }
    Positionable._make_pos = function (_obj) {
        type = type || 'none';
        var obj = _obj, type = _obj.type;

        var get_skew, get_pos, get_zindex = function (n) {
            if (!this.elem || !this.elem.length) return 1;
            var v = parseFloat(this.elem.css('zIndex'));  
            return (isNaN(v) ? 1 : v);
        };

        if (type != 'text') {
            get_skew = function () { return 0; }
            get_pos = function (n) {
                if (!this.elem || !this.elem.length) return 0;
                var v;
                if (n == 'z') 
                    v = this.elem.css('zIndex');
                else {
                    n = n || 'x';
                    var skew, attr;
                    if (n == 'x') { 
                        skew = 'hSkew', attr = 'clientLeft'; 
                    } else { 
                        skew = 'vSkew'; attr = 'clientTop'; 
                    }
                    v = this.elem[0][attr] - this.pos[skew];
                }
                return (isNaN(v)) ? 0 : v;
            }
        } else {
            get_pos = function (n) {
                n = n || 'x';
                var v;
                if (n == 'z')
                    v = parseFloat(this.elem.css('zIndex'));
                else {
                    var skew, attr;
                    if (n == 'x') { 
                        skew = 'hSkew', attr = 'left'; 
                    } else {
                        skew = 'vSkew'; attr = 'top'; 
                    }
                    v = this.elem.position()[attr] - this.pos[skew];
                }
                return (isNaN(v)) ? 0 : v;
            }
            get_skew = function (n) {
                if (!(this instanceof Content) || (this.type != 'text')) return 0;
                if (!this.box || !this.elem || !this.elem.length) return 0;

                n = n || 'hSkew';
                var align = this.align, mid = 'center', dim = 'width';
                if (n == 'vSkew') { align = this.valign; mid ='middle'; dim = 'height'; }
    
                var box = this.box;
                if (!align || (align == mid))
                    return ((box[dim]() / 2) - (this.elem[dim]() / 2));
 
                return 0;
            }
        }

        var set_pos = function (n, v) {
            var align, low, skew;
            if (n == 'z') {
                this.elem.css({'zIndex':v});
                return undefined;
            } else if (n == 'x') {
                align = this.align, 
                low = 'left',  high = 'right', 
                skew = 'hSkew';
            } else {
                align = this.valign;
                low = 'top'; high = 'bottom';
                skew = 'vSkew';
            }

            if ((v === null) && (align != low)) v = 0;
            var str = v+'';
            var n = parseFloat(str);
            var css =  {};

            if (str.indexOf('%') != -1)
                css[low] = str;
            else {
                if (isNaN(n)) n = 0;
                if (align == high) css[high] = (this.pos[skew] + n) + 'px';
                else css[low] = (this.pos[skew] + n) + 'px';
            }
            this.elem.css(css);
            return undefined; // return undefined so auto_resettable will call get next time
        }

        var props = {
            x:$.extend(propDef(false, true), auto_resettable('x', get_pos, set_pos, obj)),
            y:$.extend(propDef(false, true), auto_resettable('y', get_pos, set_pos, obj)),
            z:$.extend(propDef(false, true), auto_resettable('z', get_pos, set_pos, obj)),
            hSkew:$.extend(propDef(false, false), auto_resettable('hSkew', get_skew, false, obj)), // no set skew, only allow resetting through auto_resettable
            vSkew:$.extend(propDef(false, false), auto_resettable('vSkew', get_skew, false, obj))
        };

        return Object.create({}, props);
    }

    Positionable._make_size = function (_obj) {
        var obj = _obj;
        var props = { };
        var get_size = function (n, _auto) { 
            if ((n == 'W') || (n == 'H')) {
                _obj.noset = true;
                return obj._win.resize()[n.toLowerCase()];
            }
            _obj.noset = true;
            var cn = 'client' + (n.substr(0,1).toUpperCase()) + n.substr(1);
            var v = parseFloat(this.elem[n]()); //.css(n);
            if (v < this.elem[0][cn]) v = this.elem[0][cn];
            return v;
        }
        var set_size = function (n, v, _auto) { 
            _auto.noset = true;
            var t = {};
            var str = v+'';
            var num = parseFloat(str);
            if (str.indexOf('%') != -1) num = str;
            else if (isNaN(num)) return undefined;

            t[n] = num;
            this.elem.css(t);
            return undefined;
        }

        props.width = $.extend(propDef(false, true), auto_resettable('width', get_size, set_size, obj));
        props.height= $.extend(propDef(false, true), auto_resettable('height', get_size, set_size, obj));
        props.w = props.width;
        props.h = props.height;
        if (obj instanceof Content) {
            props.W = propDef(false, true, undefined, undefined, function () { return obj._win.size.width; }, function (v) { return obj._win.size.width = v; });
            props.H = propDef(false, true, undefined, undefined, function () { return obj._win.size.height; }, function (v) { return obj._win.size.height = v; });
        } else {
            props.W = props.w;
            props.H = props.h;
        }
        return Object.create({}, props);
    }

    Positionable.prototype = Object.create({}, {
      repos:propDef(function (x,y,z,noset) {
        if ((this instanceof Content) && (this.type != 'text') && this.parent) return this.parent.repos(x,y,z,noset);
        if (x && (typeof(x) == 'object')) return this.repos(x.x,x.y,x.z,y);
        if (x && (typeof(x) == 'boolean')) {
            if (typeof(this.pos) == 'object') {
                this.pos.hSkew = undefined;
                this.pos.vSkew = undefined;
            }
            return this.repos(this._defpos);
        }
        if (!arguments.length) {
            if (!this.pos) this.pos = Positionable._make_pos(this);
            return this.pos;
        }

        if (typeof(this.pos) != 'object') this.repos();
        var p = { };
 
        if (undefined !== x) this.pos.x = x;
        if (undefined !== y) this.pos.y = y;
        if (undefined !== z) this.pos.z = z;
        return this.pos;
      }),
      resize:propDef(function (w,h,noset) {
        if (w && (typeof(w) == 'object')) return this.resize((w.width || w.w), (w.height || w.h), h);
        if (w && (typeof(w) == 'boolean')) return this.resize(this._defsize);

        if (!arguments.length) {
            if (typeof(this.size) != 'object') this.size = Positionable._make_size(this);
            return this.size;
        }

        if (typeof(this.size) != 'object') this.resize();

        if (undefined != w) this.size.width = w;
        if (undefined != h) this.size.height = h;
        return this.size;
      })
    });

/**************************************************************************************************/

    function Window (props) {
        this.id = props.id;
        this.name = props.name;
        this._relpos = true;
        if (!this.id && (typeof(this.id) != 'number'))
            this.id = next_rand_win_id++;

        if (!this.name) this.name = this.id;

        this.elem = this.create_element(this.id, props.class);

/*TODO: move this into Positionable */
        this._defpos  = { x:props.x || 0, y:props.y || 0, z:props.z || 1 };
        this._defsize = { width:(props.w || props.width), height:(props.h || props.height) };
        if ((undefined === this._defsize.width) && (undefined !== this._defsize.height))
            this.elem.addClass('fillWidth');
        else if ((undefined === this._defsize.height) && (undefined !== this._defsize.width))
            this.elem.addClass('fillHeight');


        if (props.font)
            this.font = new Font(this, props.font);

        if (props.whenSet) 
            this._whenSet = props.whenSet;
        if (props.align) this.align = props.align;
        if (props.valign) this.valign = props.valign;


        if ((this._defpos.x < 0) && !this.align) {
            this.align = 'right';
            this._defpos.x *= -1;
        }

        if ((this._defpos.y < 0) && !this.valign) {
            this.valign = 'bottom';
            this._defpos.y *= -1;
        }

        this.repos(true); //props.x, props.y, props.z);
        this.resize(true); //props.width || props.w, props.height || props.h);

        if (props.color) {
            if (typeof(props.color) != 'object')
                props.color = { fg:props.color };
            this.colors = props.color;
            for (i in this.colors) this.colors[i] = new Color(this.colors[i]);
            if (this.colors.bg) this.elem.css('backgroundColor', this.colors.bg.rgb());
            if (this.colors.fg) this.elem.css('color', this.colors.fg.rgb());
        } else this.colors = {};

        if (props.border)
            this.border = new Border(this, props.border);

        if (props.margin)
            this.margin = new Margin(this, props.margin);

        if (props.content) {
            this.content = new Content(this, props.content);
            if (!this.content.align)  this.content.align = this.align;
            if (!this.content.valign) this.content.valign = this.valign;
            this.content.apply(this);
        }

        if (typeof(props.style) == 'object') {
            this.style = props.style;
            this.elem.css(props.style);
            if (this.content && this.content.elem) this.content.elem.find('._content_target').css(props.style);
//            this.content.elem.css(props.style);
        }

        Scheduler.Sequence.call(this, props.offset, props.duration, props.runtime, props.gap, props.repeat);

        this.first(function () { this._relpos = false; }, this);
        this.on('start', this.when_activate);
        this.on('end', this.when_deactivate);

        if (props.window) {
            if (!(props.window instanceof Array)) props.window = [props.window];
            for (var i = 0; i < props.window.length; i++) 
                this.append(WindowWrapper(props.window[i]));
        }

        if (props.overflow) {
            this._overflow = [];
            if (!(props.overflow instanceof Array)) props.overflow = [props.overflow];
            for (var i = 0; i < props.overflow.length; i++)
                this._overflow.push(new Effect(this, props.overflow[i]));
        }

        if (props.effect) {
            if (!(props.effect instanceof Array)) props.effect = [props.effect];
            for (var i = 0; i < props.effect.length; i++)
                this.children.push(new Effect(this, props.effect[i]));
        }

        return;
    }

    Window.prototype = $.extend(new Positionable(), new Scheduler.Sequence(), {
        skew:0,
        offset:0,
        duration:0,
        debug:1,
        _enabled:false,
        _active:false
    });
    Object.defineProperties(Window.prototype, {
      _markup:propDef(false, false, false, function (props) {
        with (this.pos) with (this.size)
            for (var i in props)
                eval(i + ' = ' + props[i]);
      }),
      create_element:propDef(false, false, true, function (id, classes) {
        classes = 'Window ' + (classes ? classes : '');
        return $('<div id="win_'+id+'" class="' + classes + '" />');
      }),

      append:propDef(false, false, true, function (child, attached) {
        this.children.push(child);
        if (!attached) child.attach(this, true);
        this.elem.append(child.elem);
        if (this._started && !this._ended)
            child.enable(this._started, this.duration || this.runtime, (new Date()).getTime() - this._started, 1);
        return this;
      }),

      remove:propDef(false, false, true, function (child, detached) {
        for (var i = 0; i < this.children.length; i++)
            if (this.children[i] == child) break;
        if (i == this.children.length) return this;
        this.children.splice(i, 1);
        if (!detached) child.detach(parent, true);
        return this;
      }),

      attach:propDef(false, false, true, function (parent, appended) {
        if (this._win) {
            if (this._win == parent) return this;
            this._win.remove(this);
        }
        this._win= parent;
        if (!appended) this._win.append(this, true);
        this.repos(true);
        this.resize(true);
        return this;
      }),

      detach:propDef(false, false, true, function (parent, removed) {
        if (this.parent != parent) return this;
        this.parent = false;
        if (!removed) parent.remove(this, true);
        this.elem.detach();
        return this;
      }),

      when_activate:propDef(false, false, true, function () {
        /* placeholder for starting transitioning effects */
        if (this._deactivate_timer) {
            this._deactivate_timer.cancel();
            this._deactivate = this._deactivate_timer = false;
        }
        if (this.elem) this.elem.addClass('active');
        this.resize(true);
        this.repos(true);
        if (this.content) {
            this.content.repos(true);
            if (this._overflow) {
                if ((this.content.size.width > this.size.width) || (this.content.size.height > this.size.height)) {
                    while (this._overflow.length) {
                        var fx = this._overflow.shift();
                        fx.enable(this._started, this.runtime || this.duration, 0, this._depth);
                        this.children.push(fx);
                    }
                    this._overflow = false;
                }
            }
        }
        return this;
      }),
      when_deactivate:propDef(false, false, true, function () {
        /* placeholder for stopping transitioning effects */
        if (this._deactivate_timer) this._deactivate_timer.cancel();
        /* this prevents flicker when a deactivated window is going to be reactivated from a runtime loop */
        if (this.elem) this._deactivate_timer = Scheduler.Timer(250).bind(function () { if (this._deactivate) this.elem.removeClass('active'); }, this);
        return this;
      }),

      set:propDef(false, false, true, function (val) { this.content.value = val; return this; }),
      whenSet:propDef(false,false,true, function () {
        if (this._whenSet) {
            var Win = this;
            eval(this._whenSet);
            this.when = this.offset;
        } 
        if (this._win) this._win.whenSet();
        return this;
     }),

    });


/**************************************************************************************************/

    function Effect (win, props) {
        this._win = win;
        var inherit = props.inherit;

        if (!inherit && props.name) inherit = props.name;

        if (inherit && Effect.builtin[inherit])
            $.extend(this, Effect.builtin[inherit]);

        this._orig = {};
        if (props.name) this.name = props.name;
        if (!this.name) this.name = 'custom';
                
        if (props.seq) this.seq = props.seq;
        if (props.ease) this.ease = props.ease;

        Scheduler.Sequence.call(this, props.offset, props.duration, props.runtime, props.gap, props.repeat);

        if (!this.init) this.init = {};
        if (props.init instanceof Object) 
            $.extend(this.init, props.init);

        if (props.props instanceof Object) {
            if (typeof(this.props) != 'object') this.props = {};
            $.extend(this.props, props.props);
        }

        if (props.effect) {
            if (!(props.effect instanceof Array)) props.effect = [props.effect];
            for (var i = 0; i < props.effect.length; i++) {
                var pfx = props.effect[i];
                if (typeof(pfx) != 'object') pfx = { name:pfx };
                var fx = new Effect(win, pfx);
                this._delete_overrides();
                this.children.push(fx);
                this._skewed = fx;
            }
        }

        this.first(this.when_activate);
        this.on('start', this.when_start);
        this.lastly(this.when_deactivate);
        this.on('end', this.when_stop);

        return;
    }

    Effect.prototype = $.extend(new Scheduler.Sequence(), {
        debug:1,
        seq:0,
        duration:0,
        offset:0,
        repeat:0,
        ease:'linear'
    });

    Object.defineProperties(Effect.prototype, {
     when_activate:propDef(false, false, true, function () {
        this.init_props();
        return this;
      }),

      init_props:propDef(false, false, true, function () {
        var c = 0; for (var i in this.init) { c++; break; }
        if (!c) return this;
        var Win = this._win;
        var Con = Win.content;
        Con.repos();
        Con.resize();
        Win.resize();
        Con.size.W = Con.size.H = undefined;

        css = Object.create(Con.elem[0].style, {});

        var cx = (Con.size.w / 2),
            CX = (Con.size.W / 2),
            cy = (Con.size.h / 2),
            CY = (Con.size.H / 2);

        var ext = {};
        var full = $.extend({}, Con.pos, {W:0,H:0});
        for (var i in this.init) {
            if ((i in css) && !(i in full)) ext[i] = css[i];
            with (css) with (Con.pos) with (Con.size) with (ext)
                eval(i + ' = ' + this.init[i]);
        }
        Con.elem.css(ext);
        return this;
      }),

      when_start:propDef(false, false, true, function () {
        this._running_repeat = this.repeat;

        var Win = this._win;
        var Con = Win.content;

        Con.repos();
        Con.resize();
        Win.resize();

        Con.size.W = Con.size.H = undefined;
        var css = Object.create(Con.elem[0].style, {});
        var more = {
            cx:(Con.size.width / 2),
            CX:(Win.size.width / 2),
            cy:(Con.size.height / 2),
            CY:(Win.size.height / 2)
        };

        var ext = $.extend({}, Con.pos, Con.size, css);

        var duration = this.runtime || (this._ending - this._started);

        var mod = {};
        var suf = {};
        var get = {};
        var c = 0;
        for (var i in this.props) {
            var v;
            if (undefined == ext[i]) css[i] = undefined;
            else if (undefined != css[i]) css[i] = css[i];
            with (more) with (ext) with (css)
                v = eval(this.props[i]);
            mod[i] = v;
            c++;

            var tmp = parseFloat(mod[i]);
            if (!isNaN(tmp) && ((tmp+'') != (mod[i]+'')))
                suf[i] = mod[i].substr((mod[i].indexOf(tmp+'') + (tmp+'').length));
        }

        if (!c) return this;

        var ranges = {};
        for (var i in mod) {
            var n = i;
            ranges[n] = {
                  end:parseFloat(mod[i]),
                  suf:suf[i],
                 ease:this.ease
            }
            switch (n) {
                case ('x'):
                case ('y'):
                case ('z'):
                    Con.pos[n] = undefined;
                    ranges[n].start = Con.pos[n]; //repos()[i]; //parseFloat(eval('Con.elem.' + get[i])),
                    break;
                case ('W'):
                case ('H'):
                case ('width'):
                case ('height'):
                    ranges[n].start = Win.size[n]; //resize()[n];
                    break;
                default:
                    ranges[n].start = parseFloat(Con.elem.css(n));
                    if (isNaN(ranges[n].start)) ranges[n].start = 0;
                    break;
            }
            ranges[n].range = ranges[n].end - ranges[n].start;
        }
        var idx = 1;
        var name = this.name;

        var gap = this.gap;

        this._canceled = false;
        this.on('stop', function () { this._canceled = true; });

        var SEQ = this;

        var fx_start = function (seq) {
            var step = false;
            var timer = false;
            var last = 0, lastElapsed = 0;
            var tic = 0;
            return function (seq) {
                var res = {};
                /* skew the last cycle ((1 - pos) < the step) to 1. 
                   this is to prevent slightly unfinished translations */
                if (last) {
                    step = seq._pos - last;
                    tic = seq._elapsed - lastElapsed;
                    if ((1 - seq._pos) < step) seq._pos = 1;
                }

				if (name == 'shrink logo') {
					var blah = 243232;
				}
                last = seq._pos;
                lastElapsed = seq._elapsed;

                if (!tic) return true;
                if (Con.type == 'image') {
                    var blahe = 10;
                }

                for (var i in ranges) {
                    var e = $.easing[ranges[i].ease](seq._pos, seq._elapsed, 0, 1, seq._remain + seq._elapsed);
                    var v = ranges[i].range * e;
                    v += ranges[i].start;
                    res[i] = v;
                    if (ranges[i].suf) res[i] += ranges[i].suf;
                }
                
                idx++;

                var r = 0;
                for (var i in res) {
                    switch (i) {
                        case ('W'): 
                        case ('H'): 
                        case ('w'): 
                        case ('h'): 
                            Con.size[i] = res[i];
                            delete res[i];
                            break;
                        case ('x'):
                        case ('y'):
                        case ('z'):
                            Con.pos[i] = res[i];
                            delete res[i];
                            break;
                        default: r++;
                    }
                }

                if (r) Con.elem.css(res); //:Con.elem.stop().animate(res, tic, 'linear');
                return true;
            };
        }
        this.during(fx_start());
      }),

      next:propDef(false, false, true, function () {
        this._sequence_index++;
        if (this._sequence_index >= this.sequence.length) return this.when_deactivate();
        return this.sequence[this._sequence_index].enable(this._from, this._span, this._skew, this._depth+1);
      }),

      when_stop:propDef(false, false, true, function () {
        this._win._context.elem.stop(true, true);
        return this;
        this._running_repeat--;
        if (this._running_repeat <= 0) return true;
        this._sequence_index = -1;
        return this.next();
      }),
      when_deactivate:propDef(false, false, true, function () { 
      })
    });


    Effect.builtin = {
        'scroll in left':{
            init:{ 'x':'W' },
            props:{ 'x':'CX-cx' },
//            duration:'1000 * (W / 100)'  /* 100 pixels per second */
        },
        'scroll in right':{
            init:{ 'x':'-w' },
            props:{ 'x':'CX-cx' },
//            duration:'1000 * (w / 100)'  /* 100 pixels per second */
        },
        'scroll in up':{
            init:{ 'y':'H' },
            props:{ 'y':'CY-cy' },
//            duration:'1000 * (h / 100)'  /* 100 pixels per second */
        },
        'scroll in down':{
            init:{ 'y':'-h' },
            props:{ 'y':'CY-cy' },
//            duration:'1000 * (h / 100)'  /* 100 pixels per second */
        },

        'scroll right': {
            init:{ 'x':'-w' },
            props:{ 'x':'W' }
        },
        'scroll left': {
            init:{ 'x':'W' },
            props:{ 'x':'-w' }
        },
        'scroll up': {
            init:{ 'y':'H' },
            props:{ 'y':'-h' }
        },
        'scroll down': {
            init:{ 'y':'-h' },
            props:{ 'y':'H' }
        },

        'scroll out left':{
//            init:{ 'x':'CX-cx' },
            props:{ 'x':'-w' },
//            duration:'1000 * (w / 100)'  /* 100 pixels per second */
        },
        'scroll out right':{
//            init:{ 'x':'CX-cx'},
            props:{ 'x':'W' },
//            duration:'1000 * (w / 100)'  /* 100 pixels per second */
        },
        'scroll out up':{
//            init:{ 'y':'CY-cy' },
            props:{ 'y':'h' },
//            duration:'1000 * (h / 100)'  /* 100 pixels per second */
        },
        'scroll out down':{
//            init:{ 'y':'CY-cy' },
            props:{ 'y':'H' },
//            runtime:'1000 * (h / 100)'  /* 100 pixels per second */
        },

        'grow':{
            props:{ 'H':'H*2', 'W':'W*2' },
//            duration:'50%'
        },

        'shrink':{
            props:{ 'H':'H/2', 'W':'W/2' },
//            duration:'50%'
        },

        'blink out':{
           props:{ 'opacity':0.0 },
         runtime:500
        },
        'blink in':{
           props:{ 'opacity':1.0 },
         runtime:500
        },

        'blink':{
            effect:[ 
                { name:'blink in',  duration:'50%' },
                { name:'blink out', duration:'50%', offset:'+100' }
            ],
            runtime:1000,
            gap:'100'
        }
            
    };


/**************************************************************************************************/

    function Content (win, props) { /* type[text,image,video], props vary */
        this._win = win;
        if (typeof(props) != 'object')
            props = { value:props + '' };

        if (props.align) this.align = props.align;
        else if (win.align) this.align = win.align;
        if (props.valign) this.valign = props.valign;
        else if (win.valign) this.valign = win.valign;
        if (props.target) this.target = props.target;
        if (props.whenSet) this.whenSet = props.whenSet;

        this.type = props.type;  delete props.type;
        this.value = props.value; delete props.value;
        this.value = props.value; 
        this._defpos = {x:0,y:0,z:0};

        this.style = {};
        if (typeof(props.style) == 'object')
            for (var i in props.style) this.style[i] = props.style[i];
        delete props.style;
        for (var i in props) this.style[i] = props[i];

        this.repos();
        this.resize();
        return;
    }

    Content.prototype = new Positionable();
    Object.defineProperties(Content.prototype, {
      apply:propDef(false, false, true, function (win) {
        win.elem.append(this.box);
        if (this.type == 'text' && win.colors.fg) 
            this.elem.css('color', win.colors.fg.rgb());
        this.parent = win;
        return win;
      }),
      type:propDef(false, false, undefined, undefined, 
        function () { return this._type; },
        function (type) { 
            if (type == this._type) return type;
            if (this.elem) this.elem.detach();
            this._type = type;
            var cls = '';
            var value = this.value;
            switch (this.type) {
                case ('image'):
                    this.elem = this.box = $('<img class="content image" />'); // src="' + value + '" />');
                    if (this.style) this.elem.css(this.style);
                    break;
                case ('markup'):
                    this._markup = value;
                    this.value = undefined;
                    break;
                case ('paragraph'):
                    cls = 'paragraph';
                    this._type = 'text';
                case ('text'):
                    this.box = $('<div class="contentBox ' + cls + '"><table class="content text"><tr><td class="_content_target"></td></tr></table></div>');
                    this.elem = this.box.find('.content.text');
                    if (this.style) this.elem.find('._content_target').css(this.style);
                    break;
                case ('style'):
                    var o = {};
                    o[this.target] = value;
                    this._win.elem.css(o);
                    break;
                case ('tmpl'):
                    break;
                case ('video'):
                    /* not yet supported */
                default:
                    this.elem = this.box = $('<span class="content unsupported" />');
                    this.elem.find('._content_target').css(this.style);
                    break;
            }

            if (value) this.value = value;
            return this._type;
        }
      ),
      value:propDef(false, false, undefined, undefined,
        function () { return this._value; }, 
        function (value) {
          if (!this.type) {
              if (value.match(/\.(jpg|png|gif|ico|bmp)$/i))
                  this.type = 'image';
              else if (value.match(/\.(mov|mpg|mpeg|avi|flv|wmv)$/i))
                  this.type = 'video';
              else
                  this.type = 'text';
          }
          var old_value = this.value;
          if (old_value == value) return;
          switch (this.type) {
              case ('image'):
                  this.elem.attr('src', value);
                  break;
              case ('markup'):
                  if (!value) break; 
                  if (value.indexOf('%') !== -1) value = decodeURIComponent(value);
                  value = this._markup.replace(/\$value/g, value);
              case ('text'):
                  if (!value) break; 
                  if (value.indexOf('%') !== -1) value = decodeURIComponent(value);
                  this.elem.find('._content_target').empty().text(value);
 //                    this.elem.find('._content_target').empty().text(decodeURIComponent(escape(eval('"' + value + '"'))));
                  this.resize(true);
                  this.repos(true);
                  break;
              case ('style'):
                  var o = {};
                  o[this.target] = value;
                  this._win.elem.css(o);
                  break;
              case ('tmpl'):
                  if (old_value && old_value.detach) old_value.detach();
                  Tmpl(value).bind(function (tmpl) {
                      var win = WindowWrapper(tmpl);
                      this.value = win;
                      this._win.append(win);
                      return false;
                  }, this);
                  break;
              case ('video'):
                  /* not yet implemented */
              default:
                  break;
          }
          this._value = value;
          this._win.whenSet();
          return this._value = value;
        }
      ),
      set:propDef(false, false, true, function (value) { return this.value = value; }),
      state:propDef(false, false, true, function () {
        return {
            x:this.elem.css('left'),
            y:this.elem.css('top'),
            w:this.elem.css('width'),
            h:this.elem.css('height'),
            visible:this.elem.css('visible'),
        };
      })
    });


/**************************************************************************************************/

    function CssController (_map) { 
        var map = _map;
        return function (_win, props) {
            var values = {};
            var win = _win;
    
            for (var i in map)
                Object.defineProperty(this, i, propDef(false, true, false, undefined, 
                    (function(_n) { return function () { return values[_n]; }; })(i), 
                    (function(_n,_c) { return function (v) { if (values[_n] != v) win.elem.css(_c, (values[_n] = v)); return v; }; })(i, map[i])
                ));
            Object.defineProperty(this, 'apply', propDef(false, false,false, function (_win) { _win = _win || win; if (_win && _win.elem) _win.elem.css(font); }));
            Object.defineProperty(this, 'set', propDef(false, false,false, function (p) { 
                if (typeof(props) != 'object') {
                    win.elem.css(props);
                    for (var i in map)
                        values[i] = win.elem.css(map[i]);
                    return;
                }
                for (var i in p) if (i in map) this[i] = p[i]; 
            }));
    
            this.set(props);
        };
    }


/**************************************************************************************************/

    var Font = CssController({ size:'fontSize', family:'fontFamily', style:'fontStyle', variant:'fontVariant', weight:'fontWeight' });

/**************************************************************************************************/

    var Border = CssController({
        width:'borderWidth', 
        style:'borderStyle', 
        color:'borderColor', 
        topWidth:'borderTopWidth', topStyle:'borderTopStyle', topColor:'borderTopColor', 
        bottomWidth:'borderBottomWidth', bottomStyle:'borderBottomStyle', bottomColor:'borderBottomColor', 
        leftWidth:'borderLeftWidth', leftStyle:'borderLeftStyle', leftColor:'borderLeftColor',
        rightWidth:'borderRightWidth', rightStyle:'borderRightStyle', rightColor:'borderRightColor'
    });
/*
      border:propDef(false, false, true, function (w, c, m) {
        if (w && (typeof(w) == 'object')) return this.border(w.width || w.w, w.color || w.c, w.margin || w.m);
        if (!this._border) this._border = { width:0, color:{r:0,g:0,b:0}, margin:0 };
        if (!arguments.length) return { width:this._border.borderWidth, color:this._border.borderColor, margin:this._border.padding };

        var map = { width:w, margin:m }

        for (var i in map) {
            var str = map[i] + '';
            var n = parseFloat(str);
            if (isNaN(n)) delete map[i];
            else map[i] = n;
        }

        if (!(c instanceof Color)) c = new Color(c);
        map.c = c;

        this._border.borderStyle = 'solid';
        this._border.borderWidth = w;
        this._border.borderColor = c.rgb();

        this.elem.css(this._border);
        return this;
      }),
*/
/**************************************************************************************************/

    var Margin = CssController({'top':'marginTop', bottom:'marginBottom', left:'marginLeft', right:'marginRight'});

/*
    function Margin (_win, props) {
        var margin = {};
        var map = { size:'fontSize', family:'fontFamily', style:'fontStyle', variant:'fontVariant', weight:'fontWeight' };
        var win = _win;


      margin:propDef(false, false, true, function (w) {
        var str = w + '';
        var n = parseFloat(str);
        if (isNaN(n)) return this.elem.css('marginTop');
        this.elem.css('margin', n + 'px');
        return this;
      }),
*/
/**************************************************************************************************/

    function Color (r, g, b) {
        if (typeof(r) == 'string') {
            if (r.indexOf('#') == 0) {
                b = hex2dec(r.substr(5, 2));
                g = hex2dec(r.substr(3, 2));
                r = hex2dec(r.substr(1, 2));
            } else {
                b = Color.probe(r);
                r = b.r;
                g = b.g;
                b = b.b;
            }
        } else if (r && typeof(r) == 'object') {
            b = r.b;
            g = r.g;
            r = r.r;
        }
        this.r = r;
        this.g = g;
        this.b = b;
        return;
    }

    Color.prototype = { };
    Object.defineProperties(Color.prototype, {
      rgb:propDef(false, false, false, function () {
        return 'rgb( ' + this.r + ', ' + this.g + ', ' + this.b + ')';
      })
    });

    Color.probe = function (color) {
        color = color.toString();
        if(!color.match(/^#.+$|^[^0-9]+$/)) return color;
        var probe = $('#color_probe');
        if (!probe.length) {
            probe = $('<textarea id="color_probe" style="display: none; color: transparent"></textarea>');
            probe.appendTo('body');
        }
        try { probe.css('color', color); } catch(e) { return color } //IE throws an error instead of defaulting the style to some color or transparent when the value is unrecognized
        var computed = probe.css('color'); //(probe.getComputedStyle) ? probe.getComputedStyle('color') : this.ieColorToHex(probe),
        probe.css('color', 'transparent');
        if (computed == 'transparent') return color;
        var n = computed.match(/[0-9]+\s*,?/gi);
        while (n.length < 3) n.push(0);
        return { r:parseInt(n[0]), g:parseInt(n[1]), b:parseInt(n[2]) };
    };

    Color.ieColorToHex = function(probe){ // Special IE mojo, thanks to Dean Edwards for the inspiration, his code used a pop-up window to test the color, I found you can simply use a textarea instead ;)
        var value = probe.val('').get(0).createTextRange().queryCommandValue("ForeColor");
            value = (((value & 0x0000ff) << 16) | (value & 0x00ff00) | ((value & 0xff0000) >>> 16)).toString(16);
        return "#000000".slice(0, 7 - value.length) + value;
    };



/**************************************************************************************************/


    function hex2dec (str) {
        var res = 0;
        for (var i = 0; i < str.length; i++) {
            var v;
            switch (str.substr(i, 1)) {
                case ('A'):
                case ('a'): v = 10; break;
                case ('B'):
                case ('b'): v = 11; break;
                case ('C'):
                case ('c'): v = 12; break;
                case ('D'):
                case ('d'): v = 13; break;
                case ('E'):
                case ('e'): v = 14; break;
                case ('F'):
                case ('f'): v = 15; break;
                case ('0'): v = 0;  break;
                case ('1'): v = 1;  break;
                case ('2'): v = 2;  break;
                case ('3'): v = 3;  break;
                case ('4'): v = 4;  break;
                case ('5'): v = 5;  break;
                case ('6'): v = 6;  break;
                case ('7'): v = 7;  break;
                case ('8'): v = 8;  break;
                case ('9'): v = 9;  break;
                default:
                    /* invalid */
                    return 0;
            }
            res = res << 4;
            res += v;
        }
        return res;
    }



    function propDef (c, e, w, v, g, s) {
        if (typeof(c) == 'function') {
            v = c;
            delete c; delete e; delete w; delete g; delete s;
        }
        var opts = {
            configurable:false,
            enumerable:false
        };

        if (typeof(c) == 'boolean') opts.configurable = c;
        if (typeof(e) == 'boolean') opts.enumerable = e;
        if (typeof(w) == 'boolean') opts.writable = w;
        if (typeof(g) == 'function') opts.get = g;
        if (typeof(s) == 'function') opts.set = s;

        if (opts.set || opts.get) delete opts.writable;
        if (undefined !== v) opts.value = v;
        return opts;
    }

    function noop () { return this; }

    function auto_resettable (_name, _get, _set, _ctx) {
        var value = undefined,
            name = _name,
            get = _get,
            set = _set || false,
            ctx = _ctx || false;
        return {
            set:function (v) { 
                if (undefined === v) value = undefined;
                else if (set instanceof Function) {
                    var auto = {};
                    var tmp = set.call((ctx ? ctx : this), name, v, auto);
                    if (auto.noset) return tmp;
                    value = tmp;
                }
                return value;
            },
            get:function () {
                if (undefined === value) {
                    var auto = {};
                    var tmp = get.call((ctx ? ctx : this), name, auto);
                    if (auto.noset) return tmp;
                    value = tmp;
                }
                return value;
            }
        };
    }

})(this);
