/****************************************************************************************************
 *
 * Scheduler, Timer and Sequencer 
 *  ver 0.6
 *
 *  Written by Stephen Ecker
 *      2013-03-21
 *
 * TODO: the documentation needs some love
 *
 *  Most of the documentation is in the source... good luck!
 *
 *  Notibly, see:
 *      SCHEDULER CREATION:  creating a scheduler or sub scheduler
 *      SCHEDULER TIMER: create a timer within a scheduler (with potentially relative timestamps, see TIME SKEW)
 *      TIME SKEW / WHEN SPECIFICATION: specification for the WHEN parameter, for specifying when something occurs
 *
 *      SEQUENCE INSTATIATION: create a sequence within a scheduler
 *      FLOW CONTROL: methods which control the runtime of the sequence (enable, disable, start, stop, recycle, on, fire, start_internal, stop_interval, fire_interval)
 *      SEQUENCE WORDS:  method words used to indicate WHEN sequence events occur (at, from, and, then)
 *      ACTION WORDS: method words used to indicate HOW sequence events occur (do, during, first, finally)
 *      
 *      OVERRIDE SCOPES: functions which override SEQUENCE WORDS from within the context of SEQUENCE WORDS
 *
 *  EXAMPLE:  Here is a general example usage of a sequencer:
 *
 *      // create a sequence at 0ms in, for 10 seconds
 *      var seq = new Scheduler.Sequence(0, 10000);
 *
 *          // register a callback to the function 'check' which
 *          // fires 10% into the sequence (1 second)
 *          // NOTE: .at('10%', check) is equivilent to  .at('10%').do(check)
 *          seq.at('10%', check)
 *              // register a callback at 15% into the sequence for 'check'
 *              .at('15%', check)
 *              // creates a subsequence starting at 500ms from the skew point (when
 *              // the last action was performed (15% == 1.5 seconds + 500ms == 2 seconds)
 *              // which runs for 5 seconds (2 seconds + 5 seconds:  subsequence ends at 7 seconds)
 *              .from('+500', '5000')
 *                  // register a callback to 'check' at 5% in (5000 * .05 == 250ms)
 *                  .at('5%', subCheck)
 *                  // registers an interval callback which calls 'repeatingSubCheck' every
 *                  Scheduler.delay ms, starting at 100ms (skew), to 100ms from the end (until)
 *                  of the sequence
 *                  .during('+100', '-100', repeatingSubCheck)
 *              // this returns to the context of the parent sequence.  The skew is restored to
 *              // the STARTING skew of the previous sequence word (from), which allows concurent
 *              // actions to be registered with relative WHEN values.  To return to the parent
 *              // sequence at the skew of the END of the 'from' subsequence, use .then() instead.
 *              .also()
 *              // register a callback to repeatingCheck starting at 30% from the start (3s) 
 *              // with a runtime of 20% duration (2s).   (3 seconds until 5 seconds)
 *              .during('30%', '20%', repeatingCheck)
 *              // register a callback which is run immediately when the sequence is enabled
 *              .first(startit)
 *              // register a callback which is run when the sequence completes or is stopped
 *              .finally(finishit);
 *
 *          // enables and starts the sequence
 *          seq.enable();
 *
 *          // stop the sequence (and all subsequences)
 *          seq.stop();
 *
 *          // resume the sequence (and all subsequences) from its last position
 *			seq.start();
 *
 *			// restart the sequence
 *			seq.recycle();
 *
 *          // creates a sub-scheduler of Scheduler.  if Scheduler is paused, then so are
 *          // all the sub schedulers, sequences and sub-sequences.
 *          var subScheduler = Scheduler(Scheduler);
 *
 *          // create a new sequence from the sub scheduler for 2 seconds, starting 1 second after
 *          // the sub scheduler is enabled
 *          var seq2 = new subScheduler.Sequence(1000, 2000);
 *
 *			// pause the Scheduler (and all sub-schedulers, sequences and sub-sequences)
 *          // Note: this would stop subScheduler *and* seq2 
 *			Scheduler.pause(); 
 *
 *		    // resumes the Scheduler (and all sub-schedulers, sequences and sub-sequences)
 *		    // Note: this would resume subScheduler and seq2
 *		    Scheduler.resume();
 *
 *          // pause the subScheduler (and all sub-schedulers, sequences and sub-sequences)
 *          // Note: this would pause seq2, but *not* seq, as the first sequence is built
 *          // off of the main scheduler
 *          subScheduler.pause();
 *
 *          // resumes the subScheduler (and all sub-schedulers, sequences and sub-sequences)
 *          // Note: this would not pause the main scheduler however, if the main scheduler
 *          // is also currently paused, the sub scheduler will be resumed, but would not
 *          // actually start running again until the main scheduler is also resumed.
 *          subScheduler.resume();
 *
 */

(function (_w) {

    var window = _w, undefined,

    Now = function () { return (new Date()).getTime(); },


    SchedulerInstance = function (w) {
        if (!w) w = window;
        var setTimeout   = w.setTimeout,
            clearTimeout = w.clearTimeout,
            pending = [],
            next = 0,
            timeout = false,


        /************************************************************
         *
         * new Scheduler(WHEN [, CALLBACK] [, CONTEXT]):
         *
         *   Makes a schedule WHEN.  WHEN can be a relative or an 
         *   absolute time (relative times must be < 84600000 (1 day).
         *
         *   CALLBACK is called at the scheduled time.  If CONTEXT is
         *   passed, it will be used and set as the default CONTEXT
         *   for any callback assigned to the scheduler in the future
         *   (using the .bind(CALLBACK, CONTEXT) method).  If no 
         *   CONTEXT is given, the scheduler object will be used.
         *
         *   To add a CALLBACK to the returned object, use the method
         *   .bind(CALLBACK[, CONTEXT]).  If no CONTEXT is passed to
         *   .bind, then the default CONTEXT is used.  Every call to
         *   .bind may specify a different CONTEXT.
         *
         *   As with the .bind call, CALLBACK may be an array of
         *   callbacks.  All of which will be called using CONTEXT.
         *
         *   To cancel a Schedule, use the method .cancel([CALLBACK]).
         *
         *   If CALLBACK is passed to .cancel, only that callback will
         *   be canceled, otherwise the entire schedule is canceled.
         *
         *
         * Scheduler()
         *
         *   If Scheduler is called outside constructor context (i.e.
         *   called as just Scheduler(), as opposed to new Scheduler(),
         *   then an independent Scheduler is created with its own 
         *   timing loop. This can be useful if you need callbacks in
         *   parallel,  as all Schedules created from a Scheduler and
         *   all callbacks bound to a schedule are called in series.
         *   
         */
        Scheduler = function (when, callback, context) {
            if (!(this instanceof Scheduler)) {
                /* create a new, independent Scheduler */
                if ((when instanceof Object) && (when.setTimeout instanceof Function)) {
                    // if an object containing a setTimeout method is passed, then pass
                    // it through.  This is how a sub-scheduler is created since the Scheduler
                    // creates an equivilent setTimeout function.  otherwize, the current
                    // window is passed.  If this *IS* a sub scheduler, then 'window' already
                    // refers to another Scheduler, so this would create a Scheduler in parallel 
                    // to the current sub-scheduler.
                    return SchedulerInstance(when);
                } else {
                    return SchedulerInstance(window);
                }
            }

            /* if when > a day, assume an absolute timestamp */
            if (when && (when > 86400000)) this.when = when;
            else this.when = Now() + when;

            this._next = this.when;

            if (typeof(context) == 'object') this.context = context;
            else this.context = this;

            this.callbacks = [];
            if (typeof(callback) == 'function') this.bind(callback);
            else if (callback instanceof Array)
                while (callback.length) this.bind(callback.shift());

            order(this);
            return;
        };

        Scheduler.delay = 10;

        /************************************************************
         *
         * SCHEDULER TIMER
         *
         * Scheduler.Timer(WHEN, FROM, SPAN, SKEW):
         *
         *   Creates a Schedule at WHEN which may be relative to a
         *   timeline specified with FROM, SPAN and SKEW.
         *
         *   FROM: Start of timeline
         *   SPAN: Duration of timeline
         *   SKEW: Current offset within timeline
         *
         * WHEN SPECIFICATION / TIME SKEWING
         *
         *   WHEN may be specified in one of the following ways where
         *   the types are defined as:
         *      TIMESTAMP is > 86,400,000
         *      TIMEOUT   is < 86,400,000
         *      PERCENT   is between 0 and 100
         *
         * absolute timestamp: TIMESTAMP
         *      An epoch timestamp in miliseconds.  This method does 
         *      not require any other parameters. 
         *
         * absolute timeout:   TIMEOUT
         *      Time in miliseconds from now.  This method does not require
         *      any other parameters and is generally the same as setTimeout.
         *
         * absolute offset:    TIMEOUT or PERCENT%
         *      This is in the same format (a plain number) as a relative
         *      timestamp but represents the time in MS (if TIMEOUT) or
         *      a percentage of the timeline's duration (if PERCENT%) after
         *      the start of the timeline.  This is assumed if FROM is passed
         *      and is required.
         *
         * ending offset:      -TIMEOUT or -PERCENT%
         *      Time in MS (if -TIMEOUT) or a percentage of the timeline's 
         *      duration (if -PERCENT%) before the END of the timeline. This 
         *      requires at least the parameters FROM and SPAN.
         *
         * relative offset:    +TIMEOUT or +PERCENT%
         *      Time in MS (if -TIMEOUT) or a percentage of the timeline's 
         *      duration (if -PERCENT%) after SKEW.  This requires ALL 
         *      parameters to be provided.
         *
         */
        Scheduler.Timer = function (when, from, span, skew, now) {
            var t = this.parse(when, from, span, skew, now);
            return new Scheduler(t);
        };

        Scheduler.parse = function (when, from, span, skew, now) {
            when = when || 0;
            from = from || 0;
            span = span || 0;
            skew = skew || 0;
    
            now =  now  || Now();
    
            var abs_from;
            if (from > 86400000) {
                abs_from = from;
                from -= now;
            } else
                abs_from = now + from;
    
            /* if span or skew are absolute, correct them */
            if (span > 86400000) span -= abs_from;
            if (skew > 86400000) skew -= abs_from;
    
            var str = when + '';
            var pre = str.substr(0,1);
            var suf = str.substr(str.length-1, 1);
            var num = parseFloat(when);
            if (isNaN(num)) return false; /* the only time this happens */
            if (num < 0) num *= -1;
            if (num > 86400000) num -= now;
    
            var t = (suf == '%') ? (span * (num / 100)) : num;
    
            /* offset relative after skew */
            if (pre == '+')
                t += skew;
            /* offset releative before end of span */
            else if (pre == '-')
                t = span - skew - t;

            return t;
        }


        Scheduler.setTimeout   = function (func, offset) { return Scheduler.Timer(offset).bind(func); };
        Scheduler.clearTimeout = function (sch) { 
            if (sch instanceof Scheduler) return sch.cancel();
            return clearTimeout(sch);
        }

        Scheduler.prototype = {
            /*****************************************************
             *
             * cancel([CALLBACK]):
             *   cancels the schedule.  If CALLBACK is passed, only
             *   that CALLBACK is canceled, otherwise the entire
             *   schedule is canceled.
             *
             */
            cancel:function (cb) { 
                if (!(cb instanceof Function))
                    return this._canceled = true;

                var list = [];
                while (this.callbacks.length) {
                    var c = this.callbacks.shift();
                    if (c[0] == cb) continue;
                    list.push(c);
                }
                this.callbacks = list;
                return true;
            },
            /*****************************************************
             *
             * bind([CALLBACK][, CONTEXT]):
             *   binds a new CALLBACK to the schedule. If CONTEXT
             *   is passed, it will be used otherwize the default
             *   CONTEXT is used.
             *
             */
            bind:function (cb, ctx) {
                ctx = ctx || this.context;
                this.callbacks.push([cb, ctx]);
                return this;
            }
        };


        /**************************************************
         * The rest is all internal to the Scheduler
         */

        function fire (sch, now) {
            now = now || Now();
            sch.elapsed = (now - sch.when);

            var ret = true;
            var cblist = sch.callbacks;
            for (var i = 0; i < cblist.length;  i++) {
                var cb = cblist[i][0];
                var ctx = cblist[i][1] || this.context;
                ret = cb.call(ctx, sch);
                if (ret === false) {
                    sch.cancel();
                    return ret;
                }
            }
            return ret;
        }

        var running = false, paused = false, delayed = false;
        var now = Now();
        function process (resume) {
            if (running && !resume) return true;
            running = true;
            if (paused) return true;
            now = Now();
            if (pending.length && (pending[0]._next <= next)) {
                var sch = pending.shift();
                if (!sch._canceled) fire(sch, now);
            }

            set_timer(now);
            running = false;
            return true;
        }

        Scheduler.pause = function () {
            if (paused) return;
            // now that I think about it, no reason you can't fault a scheduler that isn't running yet
            // addendum ( much later ):  what the hell did I mean by "fault a scheduler" O_o
//            if (!running ) return;
            paused = Now();
            clearTimeout(timeout);
            timeout = false;
            return;
        }

        Scheduler.resume = function () {
            if (!paused) return;
            var resume = Now();
            delayed = resume - paused;
            for (var i = 0; i < pending.length; i++) {
                pending[i].scheduled = pending[i]._next;
                pending[i]._next += delayed;
                pending[i].delayed = delayed;
            }
            paused = false;
            if (running) process(true);
            return;
        }

        function set_timer (n) {
            n = n || now;
            clearTimeout(timeout); 
            timeout = false;
            next = 0;

            if (pending.length)
                timeout = setTimeout(process, ((next = pending[0]._next) - n));

            return true;
        }

        function order (sch) {
            for (var i = 0; i < pending.length; i++)
                if (pending[i]._next > sch._next) break;

            if (!i)
                pending.unshift(sch);
            else if (!pending[i])
                pending.push(sch);
            else
                pending.splice(i, 0, sch);

            if (!timeout) process();
            return sch;
        }

        return Scheduler;

    };

    /********************************************************************************
     * 
     * SUB-SCHEDULER CREATION
     *
     * create and assign a Scheduler into the global scope.  New Schedulers can be
     * created by calling Scheduler() with no parameters, and *without* the 'new'
     * keyword.  You may pass an object as the first parameter from which the
     * Scheduler will get its setTimeout and clearTimeout functions from.  This is
     * useful if you want to wrap a Scheduler into an existing scheduler.
     *
     * e.g.:  var subScheduler = Scheduler(Scheduler);
     *      -- all schedules made with subScheduler will be fired from Scheduler
     */

    var Scheduler = window.Scheduler = SchedulerInstance(window);



    /********************************************************************************
     *
     * SEQUENCE CREATION
     *
     * new Sequence(WHEN, UNTIL, CONTEXT): 
     * (note: the implementor will generally call new Scheduler.Sequence)
     *                      
     *   Create a new Sequence from WHEN to UNTIL.  If CONTEXT is passed, it will be
     *   used as the default context for all callbacks within the sequence (unless
     *   the callback was registred with its own CONTEXT).
     *
     * Both WHEN and UNTIL can be absolute TIMESTAMPS, absolute TIMEOUTS, or more 
     * relative PERCENTS and OFFSETS (see WHEN SPECIFICATION above, under the heading 
     * for Scheduler.Timer).
     *
     * If WHEN and/or UNTIL are specified as anything other than absolute TIMESTAMPS
     * or TIMEOUTS, then the sequence must be attached within a parent Sequence.  The
     * Parent sequence provides the FROM, SPAN and SKEW in order to evaluate WHEN
     * and UNTIL.
     *
     */
    Sequence = Scheduler.Sequence = function (when, until, runtime, gap, during, ctx) {
        if (!until) until = '100%';
        this.when = when;
        this.until = until;
        this._runtime = runtime;
        this._gap = gap;
        this._during = during;

        if (!this.when) this.when = 0;

        this.children = [];
        this._enabled = false;
        this._started = false;
        this._callbacks = { first:[], start:[], end:[], 'finally':[], during:[] };
            
        this._context = ctx || this;

        this._timers = [];
        this._timers.start = false;
        this._timers.end = false;

        return this;
    };

    Sequence.prototype = {
        _delete_overrides:function() {
            delete this.and;
            delete this.then;
            return this;
        },
        /****************************************************************************
         *
         * FLOW CONTROL
         *
         *  These methods control the flow or 'playback' of the sequence.  Usually
         *  once a sequence is defined, the implementer need only call 'enable' from
         *  the root or parent sequence.  The rest is handled internally.
         *
         * sequence.enable ([FROM, SPAN, SKEW, DEPTH]):
         *   Enable the sequence.  An implementer need only call this method on the
         *   main sequence with no parameters.  All sub-sequences are enabled and 
         *   started when appropreate based on their WHEN and UNTIL specifications.
         *
         */
        enable:function (from, span, skew, depth) {
            if (this._enabled && !this._disabled) return this;
            this._depth = depth || 0;
            this._depth++;
            this._disabled = this._started = this._ended = false;
            this._from = from; 
            this._span = span; 
            this._skew = skew;

            var now = Now();
            this._enabled = now;

            if (!skew) skew = 0;

            this._start = Scheduler.parse(this.when, from, span, skew, now); //skew)    ;
            if (from)
                this._starting = (from - now) + now + this._start;
            else
                this._starting = now + this._start;

//            if (skew) now = skew;
            var until = this.until + '';
            if (!span && ((until.indexOf('%') != -1) || (until.indexOf('+') != -1) || (until.indexOf('-') != -1))) this.until = 0;
            if (this.until) {
                this.duration = this._end = Scheduler.parse(this.until, from, span, this._starting - (skew || now), this._starting);
                this._ending = this._starting + this._end;
                if (this._ending < now) {
                    this.enabled = false;
                    return this;
                }
                if (this.until && this._ending && !this._timers.end)
                    this._timers.end = new Scheduler(this._ending).bind(this.disable, this); //.Timer(this.until, this._from, this._span, this._started).bind(this.disable, this);
            }

            if (this._during) {
                if (!this._runtime && this.duration)
                    this._runtime = this.duration / this._during;
            }
                
            if (this._runtime) {
                this.runtime = Scheduler.parse(this._runtime, from, span, this._starting - (skew || now), this._starting);
                if (this._gap)
                    this.gap = Scheduler.parse(this._gap, 0, this.runtime, 0, now);
                else this.gap = 0;
            }


            this.fire('first', now);

            this._timers.start = new Scheduler(this._starting).bind(this.start, this);
            
            return this;
        },
        /****************************************************************************
         *
         * sequence.disable():
         *   Called to disable a sequence.  This will disable all sub-sequences as
         *   well and is called automatically upon completion of the sequence.
         *
         */
        disable:function () {
            if (!this._enabled || this._disabled) return this;
            if (this._timers.start) this._timers.start.cancel();
            if (this._timers.end) this._timers.end.cancel();
            if (this._timers.recycle) this._timers.recycle.cancel();
            this._timers.start = this._timers.end = this._timers.recycle = undefined;
            this.stop();
            this._disabled = Now();

            this.fire('finally', this._disabled);

            return this;
        },
        /****************************************************************************
         *
         * sequence.start(schedule):
         *   Callback to start the sequence.  It is called from the Scheduler, created
         *   by Scheduler.Timer upon enabling the sequence.  An Implementer should never
         *   call this method, use enable() instead.
         *
         */
        start:function (sch) {
            if (this._started || !this._enabled) return this;
            if (this._timers.start != sch) {
                console.log("=== Warning, attempted start from incorrect timer");
                return this;
            }
            this._sch = sch;
            this._started = Now();
            this._ended = false;

            if (this.debug) 
                console.log('** Starting sequence "' + (this.name || 'unnamed' ) + '" at ' + this._started + ' for ' + (this.duration || this.runtime));

            if (this.runtime) {
                this._timers.recycle = Scheduler.Timer(this.runtime).bind(this.recycle, this);
                if (this.debug) 
                    console.log('--> Recycling sequence "' + (this.name || 'unnamed' ) + '" after ' + this.runtime + ' ms');
            }

            this.fire('start', this._started);

            var offset = 0;
            for (var i = 0; i < this.children.length; i++) {
                var seq = this.children[i];
                seq.enable(this._started, this.runtime || this.duration, offset, this._depth);
                offset = seq._recycling || seq._ending;
            }


            if (this._callbacks.during.length) this.start_interval();
            
            return this;
        },
        /****************************************************************************
         *
         * sequence.stop(schedule):
         *   Callback to stop the sequence.  It is called from the Scheduler created
         *   by Scheduler.Timer upon starting the sequence.  An Implementer should never
         *   call this method, use disable() instead.
         *
         */
        stop:function (sch) {
            if (this._timers.start) this._timers.start.cancel();
            if (this._timers.recycle) this._timers.recycle.cancel();
            this._timers.start = this._timers.recycle = false;
            this.stop_interval();

            if (!this._enabled || this._disabled || !this._started || this._ended) return this;

            this._sch = sch;

            this._ended = Now();
            if (this.debug) console.log('-- Stopping sequence "' + (this.name || 'unnamed') + '" at ' + this._ended);

            for (var i = 0; i < this.children.length; i++) {
                var seq = this.children[i];
                seq.disable();
            }

            this.fire('end', this._ended);

            return this;
        },

        recycle:function (sch) {
            if (this._timers.recycle != sch) {
                console.log("=== Warning: attempted to recycle from incorrect scheduler");
                return this;
            }
            var end_timer = this._timers.end;
            this._timers.end = false;
            if (this._timers.recycle) this._timers.recycle.cancel();
            this._timers.recycle = false;
//          if (this._timers.end) this._timers.end.cancel();
            if (!this._enabled || this._ended || this._disabled) return this;
            this._recycled = Now();

            if (this.debug) console.log('## Recycling sequence "' + (this.name || 'unnamed') + '" at ' + this._recycled + ', first stopping...');

            this.stop(sch);
            this._timers.end = end_timer;

            if (!this.runtime) return this.disable();

            if (this.debug) console.log('--> ' + (this.name || 'unnamed') + ', now restarting...');
            this._timers.start = false;
        
            this._started = undefined;
            this._timers.start = new Scheduler(this.gap).bind(this.start, this);

            return this;
        },


        /****************************************************************************
         *
         * sequence.on(NAME, CALLBACK[, CONTEXT]):
         *   Maps a callback to an event.  This is internal, instead use the ACTION
         *   WORDS found below.
         *
         */
        on:function (name, cb, ctx) {
            if (!this._callbacks[name]) this._callbacks[name] = [];
            ctx = ctx || this._context;
            this._callbacks[name].push([cb, ctx]);
            return this;
        },

        /****************************************************************************
         *
         * sequence.fire(NAME):
         *   Fires all mapped callbacks for the named event.  This is for internal use
         *
         */
        fire:function (name, now) {
            var list = this._callbacks[name];
            var now = now || Now();
            if (this._ended) this._pos = 1;
            else {
                this._elapsed = now - this._started;
                this._remain = this._ending - now;
                this._pos = (now - this._started) / (this._ending - this._started);
                if (isNaN(this._pos)) this._pos = 0;
                else if (this._pos > 1) return this;
            }
            if (typeof(list) != 'object') return this;
            for (var i = 0; i < list.length; i++) {
                var cb = list[i][0]; 
                var ctx = list[i][1];
                cb.call(ctx, this, this._sch);
            }
            return this;
        },

        /****************************************************************************
         *
         * sequence.start_interval():
         * sequence.stop_interval():
         * sequence.fire_interval():
         *   starts and stops intervals, creating repeating schedules to fire in a 
         *   loop used to callback repeating events.  This is internal, use the
         *   ACTION WORD 'during' found below.
         *
         */
        start_interval:function () {
            if (!this._enabled || this._disabled || !this._started || this._ended || this._repeating) return this;
            if (this._timers.during) this._timers.during.cancel();
            this._repeating = Now();
            this._timers.during = Scheduler.Timer(Scheduler.delay).bind(this.fire_interval, this);
            return this;
        },

        stop_interval:function () {
            this._repeating = false;
            if (this._timers.during) this._timers.during.cancel();
            if (this._pos < 1) {
                this._pos = 1;
//                this.fire('during');
            }
            return this;
        },

        fire_interval:function () {
            if (this._timers.during) this._timers.during.cancel();
            if (!this._repeating) return this;
            if (this._ended) return this;

            this.fire('during');

            this._timers.during= Scheduler.Timer(Scheduler.delay).bind(this.fire_interval, this);

            return this;
        },

    /*****************************************************************
     *  SEQUENCE WORDS 
     */

        /*************************************************************
         *
         * at (WHEN, CALLBACK, CONTEXT):
         *
         *   Sets the sequence's SKEW to WHEN (see TIME SKEWING).  If 
         *   If CALLBACK is passed, it will be called at the SKEW.  It
         *   will be called in CONTEXT, if passed, otherwize the 
         *   sequence's default context is used (passed at creation).
         *
         *   The same sequence is returned, however the ACTION WORD 
         *   'do' is overridden.  When 'do' is called:
         *      1) The callback is scheduled to run at this SKEW
         *      2) The ACTION WORD 'and' is overridden to map more
         *         callbacks to this SKEW.
         *
         */
        at:function (when, cb, ctx) {
            var seq = new Sequence(when, false, ctx);
            seq._callskew = this._skewed;
            if (typeof(cb) == 'function') seq.on('start', cb);

            this._delete_overrides();
            at_overrides(seq, this);

            this.children.push(seq);
            this._skewed = seq;

            return this;
        },

        /*************************************************************
         * from (WHEN, UNTIL, CALLBACK, CONTEXT):
         *
         *   Creates a sub-sequence between WHEN and UNTIL, and sets
         *   the current sequence's SKEW to it.  If CALLBACK is passed
         *   it is scheduled at WHEN. If CONTEXT is passed it will 
         *   become the default context for the sub-sequence.  The sub-
         *   sequence is returned with a few overrides:
         *      1) SEQUENCE WORD 'then' sets the main seqeunce's SKEW
         *         and returns the main sequence.
         *      2) SEQUENCE WORD 'also' is always called on the main sequence
         *         restoring the previous SKEW.
         *      3) SEQUENCE WORD 'and' is called on the main sequence
         *         ONLY if it is the very next call, use of any other
         *         ACTION WORD removes this override.
         *          
         *   NOTE: while all subsequent ACTION WORDS apply to the sub-
         *         sequence, the CALLBACK passed to *this* function
         *         is called within the main sequence's context,
         *          *NOT* in the passed CONTEXT.  The sub-sequence is,
         *         however, passed as the first argument.  If you
         *         need a callback from this point with a specific
         *         context, there are two ways:
         *
         *   main.at(WHEN, CALLBACK, CONTEXT).then().from(WHEN, UNTIL)
         *          OR
         *   main.from(WHEN, UNTIL).first(CALLBACK, CONTEXT)
         *
         *         Both examples return the sub-context, however, the 
         *         second example restores the keywork 'and' from its override.
         *         i.e. the first example followed by .and would
         *         apply to the main sequence where, the second example
         *         followed by an .and call would apply to the
         *         sub-sequence.
         */

        from:function (when, until, cb, ctx) {
            var seq = new Sequence(when, until, ctx);

            if (!ctx && cb && (typeof(cb) != 'function')) {
                ctx = cb;
                cb = false;
            }

            this._delete_overrides();

            if (typeof(cb) == 'function')
                seq.on('start', wrap((ctx ? ctx : this.context), cb, seq));

            from_overrides(seq, this);

            this.children.push(seq);
            this._skewed = seq;

            return seq;
        },


        /****************************************************************************
         * and([CALLBACK][,CONTEXT]):
         *   
         *   Adds a callback into the current sequence at the same SKEW as the previous
         *   callback.  It is usually the same as DO, except it is sometimes overridden
         *   for chaining sub-sequence events.
         */

        and:function  (c,x) { if (c) return this['do'](c,x); return this; },

        
        /****************************************************************************
         * then():
         *
         *   Sets the SKEW from the last schedule added in this sequence.  Sometimes
         *   this is overridden to chain events in a parent sequence relative to the
         *   end of a sub-sequence.
         *
         */   
        then:function () {
            if (this.children.length) this._skewed = this.children[this.children.length-1];
            return this;
        },



    /******************************************************************
     * ACTION WORDS
     */

        /*************************************************************
         * do (CALLBACK, CONTEXT):
         *
         *   Schedules CALLBACK to be called when the sequence starts,
         *   if CONTEXT is provided, it will be used, otherwise the 
         *   default context is used.
         *
         *   NOTE: This word gets overridden by some SEQUENCE WORDS above.
         *         If this is undesirable, use 'first'
         */
        'do':function (cb, ctx) { this._delete_overrides(); this.on('start', cb, ctx); return this; },

        /*************************************************************
         * during (CALLBACK, CONTEXT):
         *
         *   The CALLBACK is called repeatedly at the Scheduler's
         *   configured frequency for the duration of the sequence.
         *   if CONTEXT is provided, it will be used, otherwise the 
         *   default context is used.
         */
        during:function (cb, ctx) {
            this._delete_overrides();
            this.on('during', cb, ctx);
            this.start_interval();
            return this;
        },

        /*************************************************************
         * first (CALLBACK, CONTEXT):
         *
         *   Schedules CALLBACK to be run when the sequence is started 
         *   before sub-sequences are enabled. if CONTEXT is provided,
         *   it will be used, otherwise the default context is used.
         *
         *   This word is NEVER overridden and ALWAYS deletes overrides
         */
        first:function   (cb, ctx) { this.on('first', cb, ctx); return this; },

        /*************************************************************
         * finally (CALLBACK, CONTEXT):
         *
         *   Schedules CALLBACK to be run when the sequence is ended
         *   after sub-sequences have ended, or otherwise been stopped.
         *   if CONTEXT is provided, it will be used, otherwise the 
         *   default context is used.
         *
         *   This word is NEVER overridden and ALWAYS deletes overrides
         */
        'finally':function (cb, ctx) { this._delete_overrides(); this.on('finally', cb, ctx); return this; },
    };

 /*************************************************************************
  * Helpers.  Just used to make the above prototypes a bit cleaner..
  */


    /************************************************************
     * wrap(CONTEXT, FUNCTION):
     *   Used internally to wrap a function to run within a context
     */

    function wrap (o,f) {
        var obj = o, func = f;
        var args = [];
        for (var i = 2; i < arguments.length; args.push(arguments[i++]));
        return function () {
            return func.apply(obj, args);
        }
    }


 /************************************************************************
  *  OVERRIDE SCOPES
  *
  *  These methods are overrides for sequences to maintain the appropriate
  *  scopes within time ranges defined with SEQUENCE WORDS
  */


    /************************************************************************
     * These overrides are common for all SEQUENCE WORDS which do overrides.
     */
    function common_overrides (seq, p) {
        if (p._skewed) {
            var skew   = p._skewed;
            var also   = seq.also || noop;
            seq.enable = function (f,s,sk,d) { 
                delete this.enable; 
                return this.enable(f,s,sk,p._depth); 
            }
            seq.also   = function () { p._skewed = skew; this.also = also; return this.also(); }
        }
        return;
    }

    /************************************************************************
     * Overrides mapped when the SEQUENCE WORD 'from' is used.
     */
    function from_overrides (seq, p) {
        var also = seq.also;
        common_overrides(seq, p);
        if (seq.also == also) seq.also = function () { seq.also = also; return p; };

        seq.then = function ()    { this._delete_overrides(); p._skewed = this; return p; }
        seq.and  = function (c,x) { this._delete_overrides(); return p.and(c,x); }

        return;
    }

    /************************************************************************
     * Overrides mapped when the SEQUENCE WORD 'at' is used.
     */
    function at_overrides (seq, p) {
        common_overrides(seq, p);

        /* single 'at' points cannot contain a repeating event */
        seq.during = function () { /* should i throw something here? */ return this; };

        var skew = p._skewed;
        p['do'] = function (cb, ctx) { 
            seq.on('start', cb, ctx);
            this.and  = function (c,x) { seq.on('start', c, x); return this; }
            this.then = function () { this._delete_overrides(); this._skewed = seq; return this; }
            this.also = function () { this._delete_overrides(); this._skewed = skew; return this; }
            return this;
        }
        return;
    }


    /***************************************************
     * noop():
     *   a function which does nothing.  used where a
     *   callback is expected but not mapped.  this
     *   saves on time checking if something is callable.
     */
    function noop () { return this; }


})(this);
