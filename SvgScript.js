/* ******************************************************************** */
/* SvgScript - shorthand for outputting svg tags. 
/* It is an idiosyncratic mix of 6502 assembler (JSR, jump subroutine and RTS, return subroutine)
/* postfix script and of course svg-tags.
/* It enables concise coding of the following svg tags: 
/*    circle, ellipse, rectangle, line, path, and text
/* polyline and filters are not yet included. 
/* The following parameters are available:
        stroke, set stroke color using SC, e.g. SC"GREEN"
        stroke-width, set using SW, e.g. SW2
        fill color, set using F, e.g. F"RED" or F"rgb(255,0,0)". Please note that the hex
/* coding format ( F"#FF0000" may not work for css background images.
/* 
/* Paths are coded using PS (path start) and PE (path end), e.g. 
/* PS M250 250 L320 320 PS translates into
/* <path d="M250 250 L320 320" fill="???" stroke-width="??" stroke="??" /> 
/* which is the line (250,250) to (320,320) in the 
/* coordinate system. 
/*
/* In addition there is filter functionality. A filter is a matrix operation that is 
/* performed on coordinates and that codes for SCL (scaling), REF (reflection), TRL (translation) and
/* ROT (rotation). They may be added on a stack and the operations are performed
/* in the order last in first executed. 
/* 
/* Variables can be assigned values using the operators: ++, --, +=, -=, =, /= and *=
/* Variables should begin with some of the following characters that do not overlap 
/* characters used by the svg path tag parameter: [bdefgijknopruvwxy] and z when not between PS and PE 
/*
/* Usage: svgOutText = SvgScript.run('script code');
/* ******************************************************************** */
class SvgScript {
    static regex = {
        'number' : '-?(\\d+\\.\\d+|\\d+)',
        'scoped' : '\\$[a-zåäö]+[0-9]*',  
        'global' : '\\$[A-ZÅÄÖ]+[0-9]*',         
    }
    ///////////////////////////////////////
    static getVal(SYSTEM, itms, pc ) { 
        var k = itms[pc];
        if ( (''+k).match( this.regex['scoped'] ) ) {
            k += '_' + SYSTEM['scopeLevel'];
        }
        SYSTEM['nextpc'] = pc+1;   // ugly quick fix
        if ( itms[pc+1] == '[' ) {
            var indexVal = this.getVal(SYSTEM, itms, pc+2 );
            SYSTEM['nextpc'] = pc+4; // does not work for nested arrays
            return ((k in SYSTEM && indexVal in SYSTEM[k]) ? SYSTEM[k][indexVal] : 0);
        }
        return k in SYSTEM ? SYSTEM[k] : k;
        // should return [ nextpc, value ] here 
    }
    static setVal(SYSTEM, k, v ) {
        if ( k.match( this.regex['scoped'] ) ) {
            k += '_' + SYSTEM['scopeLevel'];
        }
        SYSTEM[k] = v;
    }
    static getXY(SYSTEM, itms, pc, mapto ) { // TODO: will not work with arrays
        for ( var i in mapto ) {
            var dst = mapto[i];
            SYSTEM[dst] = this.getVal(SYSTEM, itms, pc+1*i );
        }
        return pc + mapto.length;
    }
    static offSetXY(SYSTEM, mapto ) {
        for ( var dst in mapto ) {
            var src = mapto[dst];
            if ( typeof SYSTEM[dst] === 'undefined' ) { SYSTEM[dst] = 0; }
            if ( typeof SYSTEM[src] === 'undefined' ) { SYSTEM[src] = 0; }
            SYSTEM[dst] = 1* SYSTEM[dst] + 1*SYSTEM[src];
        }
    }
    static setXY(SYSTEM, mapto ) { /* dst:src */
        for ( var dst in mapto ) {
            var src = mapto[dst];
            SYSTEM[ dst ] = SYSTEM[src];
        }
    }
    static FRESET(SYSTEM ) { /* Filter Reset */
        for ( var i = 1; i < 5; i++ ) {
            SYSTEM['XT'+i] = SYSTEM['X'+i];
            SYSTEM['YT'+i] = SYSTEM['Y'+i];
        }
        this.setXY(SYSTEM, {'RT':'R', 'RXT':'RX','RYT':'RY', 'SWT':'SW', 'XAT':'XA' } );
        /* XAT:XA ARC COMMAND FROT ADDS TO THIS PARAM*/
    }
    static FROT(SYSTEM, p ) {  /* Rotation around (X0,Y0) */
        var cosa = Math.cos( p['A0']*Math.PI/180);
        var sina = Math.sin( p['A0']*Math.PI/180);
        SYSTEM['XAT'] = 1*SYSTEM['XAT'] + 1*p['A0'];
        for ( var i = 1; i < 5; i++ ) {
            var x = SYSTEM['XT'+i]; var y = SYSTEM['YT'+i];
            SYSTEM['XT'+i] = (1*x-1*p['X0'])*cosa - (1*y-1*p['Y0'])*sina + 1*p['X0'];
            SYSTEM['YT'+i] = (1*x-1*p['X0'])*sina + (1*y-1*p['Y0'])*cosa + 1*p['Y0'];
        }
    }
    static FTRL(SYSTEM, p ) { /* Translate DX,DY */
        for ( var i = 1; i < 5; i++ ) {
            SYSTEM['XT'+i] = 1*SYSTEM['XT'+i] + 1*p['DX'];
            SYSTEM['YT'+i] = 1*SYSTEM['YT'+i] + 1*p['DY'];
        }
    }
    static FSCL(SYSTEM, p) { /* Scale set X0,Y0,Z0 , Z0 is in parameter here */
        /* in 3D X0,Y0 would be perspective point */
        for ( var i = 1; i < 5; i++ ) {
            SYSTEM['XT'+i] = ((1*SYSTEM['XT'+i]-1*p['X0'])/p['Z0'] )+1*p['X0'];
            SYSTEM['YT'+i] = ((1*SYSTEM['YT'+i]-1*p['Y0'])/p['Z0'] )+1*p['Y0'];
        }
        SYSTEM['RT']  = SYSTEM['RT']  / p['Z0'];
        SYSTEM['RXT'] = SYSTEM['RXT'] / p['Z0']; /* A in path */
        SYSTEM['RYT'] = SYSTEM['RYT'] / p['Z0'];
        SYSTEM['SWT'] = SYSTEM['SWT'] / p['Z0'];
    }
    static FREF(SYSTEM, p) {         /* Reflect against line  p[X0],p[Y0] - p[x1],p[y1] */
        var lx = p['X1']-p['X0'];
        var ly = p['Y1']-p['Y0'];
        var a00 = lx*lx - ly*ly;
        var a10 = 2 * lx* ly;
        var lng2 = lx*lx + ly*ly;
        for ( var i = 1; i < 5; i++ ) {
            var offX = 1*SYSTEM['XT'+i] -1*p['X0'];
            var offY = 1*SYSTEM['YT'+i] -1*p['Y0'];
            SYSTEM['XT'+i] = (a00*offX + a10*offY)/lng2 + 1*p['X0'];
            SYSTEM['YT'+i] = (a10*offX - a00*offY)/lng2 + 1*p['Y0'];
        }
    }
    static applyFilters(SYSTEM, transformPipe ) { 
        this.FRESET(SYSTEM );
        for ( var i=transformPipe.length-1; i>=0; i-- ) {
            var F = transformPipe[i];
            F['transform'](SYSTEM, F['p'] );
        }
    }
    static svgTidy(SYSTEM, tmpl, transformPipe ) {
        this.applyFilters(SYSTEM, transformPipe);   
        return tmpl.replace( /\{([\w_-]+)\}/g, function(s1,s2) { return SYSTEM[s2]; } );
    }
    static flush(SYSTEM, tmpl, transformPipe ) {
        SYSTEM['_O'] +=  SYSTEM['currentTag'].length>0 ? this.svgTidy(SYSTEM, tmpl, transformPipe ) : '';
        SYSTEM['currentTag'] = '';
    }
    static parse( inTxt ) {     
        var itms    = inTxt.match( /(SVG|ID|#|".*?"|\+\+|\+=|\+|-=|--|-?(\d+\.\d+|\d+)|-|\*=|\*|\/=|\/|=|==|\(|\)|\$[a-zåäö]+[0-9]{0,5}|\$[A-ZÅÄÖ]+[0-9]{0,5}|\[|]|TXT|TRL|SCL|REF|ROT|POP|SHIFT|JSR|RTS|RZR|BNE|BEQ|T[ra][ra]|RCT|CIR|ELL|ARC|SC|SW|F|m|M|l|L|T|t|a|A|z|Z|c|C|s|S|q|Q|t|T)/g );
        var loci    = {};
        for ( var i in itms ) {
            var itm = itms[i];
            if ( itm == '#' ) {
                loci[ itms[i*1+1] ] = i;
            }
        }
        return [itms, loci ];
    }
    static collectScope(SYSTEM, pc, itms ) {    /* BNE or JSR */
        if ( ! itms[pc] ) return pc;
        if ( !itms[pc].match( /\(|\[/ ) ) return pc;
        var callArgs = SYSTEM['callArgs'];
        pc++;
        while ( !itms[pc].match( /\)|\]/ ) ) {
            var k = itms[pc];
            callArgs.push( this.getVal(SYSTEM, itms, pc ) );
            // pc++; // this will not work with arrays in scope
            pc = 1*SYSTEM['nextpc']; 
        }
        return pc;
    }
    static injectScope(SYSTEM, pc, itms ) {
        if ( itms[pc] != '(' ) return pc;
        var callArgs = SYSTEM['callArgs'];
        pc++;
        while ( itms[pc] != ')' ) {
            var k = itms[pc];
            if ( k.match( this.regex['scoped'] ) ) { 
                k = k +'_' + SYSTEM['scopeLevel'];
            }
            SYSTEM[k] = callArgs.shift();
            pc++;
        }
        return pc+1;
    }
    static run( inTxt ) {
        if ( !inTxt.startsWith('SVG') ) return '';
        var tplText       = '<text id="{ID}" x="{XT1}" y="{YT1}" stroke="{SC}" stroke-width="{SWT}">{TXT}</text>';
        var tplPath       = '<path id="{ID}" d="{currentTag}" stroke="{SC}" stroke-width="{SWT}" fill="{F}" />';
        var tplTriangle   = 'M{XT2} {YT2} L {XT3} {YT3} L {XT4} {YT4} Z ';
        var tplPathCE     = 'M{XT1} {YT1} A {RXT} {RYT} {XAT} 1 1 {XT2} {YT2} A {RXT} {RYT} {XAT} 1 1 {XT1} {YT1} '; /* circle ellipse */
        var tplPathA      = 'M{XT2} {YT2} A {RXT} {RYT} 0 {LA} 1 {XT3} {YT3} ';
        var tplPathRect   = 'M{XT1} {YT1} L {XT2} {YT2} L {XT3} {YT3} L {XT4} {YT4} Z ';
        var tplPathMove   = 'M{XT2} {YT2} ';
        var tplPathLineTo = 'L{XT2} {YT2} ';
        var tplPathArc    = 'A{RXT} {RYT} {XAT} {LA} {SF} {XT3} {YT3} '; 
        var tplPathC      = 'C{XT2} {YT2} {XT3} {YT3} {XT4} {YT4} '; 
        var tplPathCS     = 'S{XT2} {YT2} {XT3} {YT3} '; 
        var tplPathQ      = 'Q{XT2} {YT2} {XT3} {YT3} '; 
        var tplPathQT     = 'T{XT2} {YT2} '; 

        var [itms, loci]  = this.parse( inTxt );
        var transformPipe = [];
        var returnLoci    = [];  /* Jump stack */
        var SYSTEM   = {  
            '_O' : '<svg xmlns="http://www.w3.org/2000/svg" width="'+itms[1]+'" height="'+itms[2]+'">',  
            'currentTag' : '',       
            'w0' : itms[1], 'h0' : itms[2], 'x0'         : itms[1], 'y0' : itms[2],
            'X0' : 0,       'Y0' : 0,       'Z0'         : 0,       'A0' : 0,      
            'X1' : 0,       'Y1' : 0,       'Z1'         : 0,       'SC' : 'BLACK',       
            'F'  : 'transparent',           'SW'         : '1',     'ID' : '',                         
            'callArgs': [],                 'scopeLevel' : -1,      'deltapc':0,
        }; /* System variables hash */
        var currentTag     = '';
        var start  = 0;
        var infiniteLoopProtect = 0;
        var pc     = 3;
        var pc =  loci['"main"'] ? loci['"main"'] : 3;
        while ( pc < itms.length ) {
            var itm = itms[pc++];
            // console.log( (pc-1) + ' itm:' +  itm + ' next:' + itms[pc] );
            if ( itm == '#' ) {
                pc = this.injectScope(SYSTEM, pc+1, itms );         /* id       entering routine       */
            } else if ( itm == 'JSR' ) {                        /* Jump SubRoutine   */
                var _pc = this.collectScope(SYSTEM, pc+1, itms );
                returnLoci.push( _pc );
                SYSTEM['scopeLevel']++;
                pc = loci[ itms[pc] ];
            } else if ( itm == 'RTS' ) {                        /* ReTurn Subroutine */
                SYSTEM['scopeLevel']--;
                pc = returnLoci.pop();
            } else if ( itm =='RZR' ) {                         /* Return subroutine if ZeRo ! */
                var v = this.getVal(SYSTEM, itms, pc );
                // pc++;
                pc = SYSTEM['nextpc'];
                if ( v*1 == 0 ) {
                    SYSTEM['scopeLevel']--;
                    pc = returnLoci.pop()+1;  
                }     
            } else if ( itm == 'BNE' ) {                            /* Branch on not equal to zero */
                var v = this.getVal(SYSTEM, itms, pc+1 );
                if ( v > 0 ) {
                    pc = loci[ itms[pc] ]*1;                        // pc == # location 
                } else {                                            // skipping variable
                    // pc +=2;
                    pc = SYSTEM['nextpc'];
                }
            } else if ( itm.match( /^\$/) ) {                       /* variable global or scoped */
                var v0 = this.getVal(SYSTEM, itms, pc-1 ); 
                pc = SYSTEM['nextpc'];
                if ( itms[pc]            == '++' ) { 
                    this.setVal(SYSTEM, itm, v0*1+1 );   pc--;        
                } else if ( itms[pc]     == '--' ) {
                    this.setVal(SYSTEM, itm, v0*1-1 );   pc--;        
                } else {
                    var v1 = this.getVal(SYSTEM, itms, pc+1 );      /* Enable assign from another variable */
                    if ( itms[pc]        == '=' ) {   
                        if ( itms[pc+1] == '[' ) { // declaring array
                            pc = this.collectScope(SYSTEM, pc+1, itms);
                            if ( itm.match( this.regex['scoped'] ) ) {
                                SYSTEM[itm + '_' + SYSTEM['scopeLevel']] = SYSTEM['callArgs'];
                            } else {
                                SYSTEM[itm] = SYSTEM['callArgs'];
                            }
                            SYSTEM['callArgs'] = [];
                        } else {                                    // calling from array
                            this.setVal(SYSTEM, itm, v1);
                        } 
                    }else if ( itms[pc] == '+=' ) {
                        this.setVal(SYSTEM, itm, 1*v0+1*v1 );        // does not work without coercion
                    } else if ( itms[pc] == '-=' ) {
                        this.setVal(SYSTEM, itm, 1*v0-1*v1 );
                    } else if ( itms[pc] == '*=' ) {
                        this.setVal(SYSTEM, itm, v0*v1 );
                    } else if ( itms[pc] == '/=' ) {   
                        this.setVal(SYSTEM, itm, v0/v1 );
                    }
                }
                pc = SYSTEM['nextpc'];
            } else {  
                if ( itm == 'm' || itm == 'M' ) {
                    pc  = this.getXY(SYSTEM, itms, pc, ['X2','Y2'] ); 
                    itm == 'm' ? this.offSetXY(SYSTEM, { 'X2':'X1','Y2':'Y1'} ) :0;
                    currentTag  = this.svgTidy(SYSTEM, tplPathMove, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2', 'MX1':'X2', 'MY1':'Y2' } ); /* MX1 MY1 used by Z command */
                } else if ( itm == 'l' || itm == 'L' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2'] ); 
                    itm == 'l' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1'}) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathLineTo, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'Z' || itm == 'z' ) {  
                    currentTag = 'Z ';                                  
                    this.setXY(SYSTEM, {'X1':'MX1', 'Y1':'MY1'} );
                } else if ( itm == 'a' || itm == 'A' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['RX','RY','XA','LA','SF','X3','Y3'] ); 
                    itm == 'a' ? this.offSetXY(SYSTEM,{'X3':'X1', 'Y3':'Y1' }) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathArc, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 'q' || itm == 'Q' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 'q' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathQ, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 't' || itm == 'T' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2'] ); 
                    itm == 't' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1'}) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathQT, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'c' || itm == 'C' ) {                    /* Cubic bezier */
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3','X4','Y4'] ); 
                    itm == 'c' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathC, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X4', 'Y1':'Y4'} );
                } else if ( itm == 's' || itm == 'S' ) {                    /* smooth spline */
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 's' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    currentTag = this.svgTidy(SYSTEM, tplPathCS, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                /* functions of convenience */
                } else if ( itm == 'RCT' ) {                                /* Rect  width, height */
                    pc = this.getXY(SYSTEM, itms, pc, ['DX','DY'] );         /* width height */ 
                    this.setXY(SYSTEM, { 'X2':'X1', 'X3':'X1', 'X4':'X1', 'Y2':'Y1', 'Y3':'Y1', 'Y4':'Y1' } );
                    this.offSetXY(SYSTEM, { 'X2':'DX', 'X3':'DX', 'Y3':'DY', 'Y4':'DY' } );
                    currentTag = this.svgTidy(SYSTEM, tplPathRect, transformPipe );
                } else if ( itm == 'ELL' || itm == 'CIR' ) {                /* ELL, Ellipse, CIR, Circle */
                    this.flush(SYSTEM, tplPath, transformPipe );
                    pc = this.getXY(SYSTEM, itms, pc, ['RX'] );              // set SYSTEM['RX'] == ...
                    SYSTEM['RY'] = SYSTEM['RX'];
                    pc = ( itm == 'ELL') ? this.getXY(SYSTEM, itms, pc, ['RY']) : pc;
                    SYSTEM['XA'] = 0;
                    SYSTEM['X1'] = 1*SYSTEM['X1'] - 1*SYSTEM['RX'];  
                    SYSTEM['X2'] = 1*SYSTEM['X1'] + 2*SYSTEM['RX'];  
                    SYSTEM['Y2'] = 1*SYSTEM['Y1'];  
                    currentTag = this.svgTidy(SYSTEM, tplPathCE, transformPipe );
                    SYSTEM['X1'] = 1*SYSTEM['X1'] + 1*SYSTEM['RX'];  
                } else if ( itm == 'ARC' ) {                                /* Arc X - special - rx,ry,angle start, angle end. Differs from A in path */
                    pc = this.getXY(SYSTEM, itms, pc, ['RX','RY','AS','AE'] );
                    SYSTEM['AE'] = +SYSTEM['AE'] < +SYSTEM['AS'] ? +SYSTEM['AE'] + 360 : +SYSTEM['AE'];  
                    var da = +SYSTEM['AE'] - SYSTEM['AS'];
                    SYSTEM['LA'] = da > 180 ? 1 : 0;
                    SYSTEM['X2'] = 1*SYSTEM['X1'] + SYSTEM['RX'] * Math.cos(SYSTEM['AS']* Math.PI / 180 );
                    SYSTEM['Y2'] = 1*SYSTEM['Y1'] + SYSTEM['RY'] * Math.sin(SYSTEM['AS']* Math.PI / 180 );
                    SYSTEM['X3'] = 1*SYSTEM['X1'] + SYSTEM['RX'] * Math.cos(SYSTEM['AE']* Math.PI / 180 );
                    SYSTEM['Y3'] = 1*+SYSTEM['Y1'] + SYSTEM['RY'] * Math.sin(SYSTEM['AE']* Math.PI / 180 );
                    currentTag = this.svgTidy(SYSTEM, tplPathA, transformPipe );
                } else if ( itm.match(/T[ra][ra]/ ) ) {                     /* Triangle TODO:semantic not good fix it */
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3','X4','Y4'] ); 
                    itm.match( /^Tr\w/ ) ? this.offSetXY(SYSTEM, { 'X2':'X1', 'Y2':'Y1'} ) : 0;
                    itm.match( /^T\wr/ ) ? this.offSetXY(SYSTEM, { 'X3':'X2', 'X4':'X2', 'Y3':'Y2', 'Y4':'Y2'} ) : 0;
                    SYSTEM['currentTag'] += this.svgTidy(SYSTEM, tplTriangle, transformPipe );  
                    this.flush(SYSTEM, tplPath, transformPipe );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2', 'MX1':'X2', 'MY1':'Y2' } ); /* MX1 MY1 used by Z command */
                } else if ( itm == 'TXT' ) {
                    this.flush(SYSTEM, tplPath, transformPipe );
                    SYSTEM['TXT'] = itms[pc]; 
                    if ( SYSTEM['TXT'].charAt(0) == '"' ) {
                        SYSTEM['TXT'] = SYSTEM['TXT'].replace(/"/g, '');
                        pc++;
                    } else {
                        SYSTEM['TXT'] = this.getVal(SYSTEM, itms, pc );
                        pc = SYSTEM['nextpc'];
                    }
                    SYSTEM['_O'] += this.svgTidy(SYSTEM, tplText, transformPipe );
                } else if ( itm == 'F' || itm == 'SC' || itm == 'SW' || itm == 'ID' ) { /*F fill, SC stroke color */
                    this.flush(SYSTEM, tplPath, transformPipe );
                    var v = this.getVal( SYSTEM, itms, pc );
                    if ( typeof v === 'string' ) v.replace( /"/g, '' ); // v may be a number 22 dec 2024 
                    SYSTEM[itm] = v;
                    pc = 1*SYSTEM['nextpc'];
                } else { // coordinate transform pipeline
                    this.flush(SYSTEM, tplPath, transformPipe );
                    if ( itm == 'ROT' ) {                                       /* Filter rotate x,y,a */ 
                        pc = this.getXY(SYSTEM, itms, pc, ['X0','Y0','A0'] ); 
                        transformPipe.push( { 'transform': this.FROT, p:{ 'X0':SYSTEM['X0'], 'Y0':SYSTEM['Y0'], 'A0':SYSTEM['A0'] } } );
                    } else if ( itm == 'TRL' ) {                                /* Filter translate dx, dy */ 
                        pc = this.getXY(SYSTEM, itms, pc, ['DX','DY'] ); 
                        transformPipe.push( { 'transform': this.FTRL, p:{ 'DX':SYSTEM['DX'], 'DY':SYSTEM['DY'] } } );
                    } else if ( itm == 'SCL' ) {                                /* Filter scale */
                        pc = this.getXY(SYSTEM, itms, pc, ['X0','Y0','Z0'] ); 
                        transformPipe.push( { 'transform': this.FSCL, p:{ 'X0':SYSTEM['X0'], 'Y0':SYSTEM['Y0'], 'Z0':SYSTEM['Z0'] } } );
                    } else if ( itm == 'REF' ) {                                /* Filter reflect x,y line through origin */
                        var p = {};
                        pc = this.getXY( p, itms, pc, ['X0','Y0', 'X1','Y1'] ); // n.b. p instead of SYSTEM
                        transformPipe.push( { 'transform': this.FREF, 'p':p } );
                    } else if ( itm =='POP' ) {                                 /* Filter pop. Removes last filter    */
                        transformPipe.pop();
                    } else if ( itm =='SHIFT' ) {                               /* Filter shift. Removes first filter */
                        transformPipe.shift();
                    }
                }
            }
            SYSTEM['currentTag'] += currentTag;
            currentTag = '';
            if ( infiniteLoopProtect++ > 4999 ) return 'Iteration limit. Max 5000 iterations.';
        }
        this.flush(SYSTEM, tplPath, transformPipe );
        /* Tidy. Three decimal precision should suffice */    
        var _O = SYSTEM['_O'].replace( /(\.\d{3})\d+/g, function(s1,s2) { return s2; } );
        return _O + '</svg>';
    }
}
