/**********************************************************************************************
 * XML Template loader and parser.
 *    Stephen Ecker ~2012
 *
 * This library essentially loads an XML file, and parses it.  Other code calls .bind to register
 * callbacks for handling known tags.  It is a fairly simple, no frills parser.
 */

(function (_w) {
    var window = _w, undefined,
		_main = arguments.callee,

    Tmpl = window.Tmpl = function (loc, cb, ctx) { 
		if (!arguments.length) {
			var tmp = {};
			_main(tmp);
			return tmp.Tmpl;
		}

		if (typeof(loc) == 'object') {
			var t = new Tmpl.init(false, cb, ctx);
			t._parse(loc);
			return t;
		}
		return new Tmpl.init(loc, cb, ctx); 
	};

	var handlers = {
		list:function (list) { 
			for (var i in list) {
				var func = Tmpl.handler(i);
				if (!func) continue;
				var t = list[i];
				if (!(t instanceof Array)) t = [t];
				for (var c = 0; c < t.length; c++)
					func(t[c]);
			}
		}
	};

	Tmpl.handler = function(name, func) { 
		var last = handlers[name];
		if (func instanceof Function)
			handlers[name] = func; 
		return last;
	}

    Tmpl.init = function (loc, cb, ctx) {
        this._loc = loc;
        this._callbacks = [];
        this._complete = false;
        if (cb instanceof Function) {
            if (typeof(ctx) != 'object') ctx = this;
            this._callbacks.push([cb, ctx]);
        }

		if (loc) this._req = $.ajax({ url: loc, success: this._loaded, context:this, dataType: 'xml' });

        return this;
    };

    Tmpl.init.prototype = {
        bind:function (cb, ctx) {
            ctx = ctx || this;
            this._callbacks.push([cb, ctx]);
            if (this._complete) this._fire();
            return this;
        },
        _loaded:function (data, stat, xhr) {
            this._complete = true;
            this._stat = stat;
            this._xml = data;

            this._parse();
            this._fire();
            return true;
        },
        _fire:function () {
            while (this._callbacks.length) {
                var cb = this._callbacks.shift();
                if (false === cb[0].call(cb[1], this._tmpl, this._req)) return false;
            }
            return this;
        },

        _parse:function (win) {
            var jq;
			if (!win) win = this._xml;
			var children = $(win).children();
			for (var i = 0; i < children.length; i++) {
				this._tmpl = unfold_xml(children[i]);
				if (false === this._fire()) continue;
				if (typeof(handlers[children[i].localName]) == 'function')
					handlers[children[i].localName](this._tmpl);
			}

			this._tmpl = undefined;

            this._fire();
            return this;
        }
    };


    function unfold_xml (xml) {
        if (xml.nodeType == 3) return xml.nodeValue;

        var obj = {};
        var children = $(xml).children();

        if (xml.attributes) for (var i = 0; i < xml.attributes.length; i++)
            obj[xml.attributes[i].localName] = xml.attributes[i].value;

        if ((xml.childNodes.length == 1) && (xml.childNodes[0].nodeType == 3)) {
            obj.value = xml.childNodes[0].nodeValue;
            var c = 0; for (var i in obj) c++;
            if (c == 1) return obj.value;
            return obj;
        }

        for (var i = 0; i < children.length; i++) {
            var c = children[i];
            var n = c.localName;
            if (c.nodeType == 3) n = 'value';
            if (obj[n]) {
                if (!(obj[n] instanceof Array)) obj[n] = [obj[n]];
                obj[n].push(unfold_xml(c));
            } else
                obj[n] = unfold_xml(c);

        }

        var c = 0; for (var i in obj) { c++; }
        if ((c == 1) && (undefined !== obj.value)) return obj.value;

        return obj;
    }

})(this);
