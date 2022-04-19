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

    static lexems = [
        "",         "SVG",                   // SVG width, height  0
        "",         "ID",                    // ID                 1
        "BRANCH",   "#",                     // BOM                2
        "STRING",   '".*?"',                 // STRING             3
        "INC",      "\\+\\+",                // increment operator 4
        "INCADD",   "\\+=",                  // increment operator 5
        "PLUS",     "\\+",                   // operator           6
        "DECSUB",   "-=",                    // decrement operator
        "DEC",      "--",                    // decrement operator
        "NUMBER",   "-?(\\d+\\.\\d+|\\d+)",  // number. must handle cases such as -0.12  (must come before - below)
        "MINUS",    "-",                     // operator
        "MULOP",    "\\*=",                  // mult operator
        "MUL",      "\\*",                   // operator
        "DIVOP",    "/=",                    // division operator
        "DIV",      "/",                     // operator
        "ASSIGN",   "=",                     // assign operator
        "EQUAL",    "==",                    // check equivalence operator
        "LPAR",     "\\(",                   // left parenthesis
        "RPAR",     "\\)",                   // right parenthesis
        "SCOPED",   "\\$[a-zåäö]+[0-9]*",    // small letter, local scope
        "GLOBAL",   "\\$[A-ZÅÄÖ]+[0-9]*",    // capital letter, global scope        
        "",         "TXT",                   // TXT
        "",         "TRL",                   // translation, transformation
        "",         "SCL",                   // scale, transformation
        "",         "REF",                   // reflection, transformation
        "",         "ROT",                   // rotation, transformation
        "",         "POP",                   // pop from transformation stack 
        "",         "SHIFT",                 // shift from transformation stack
        "",         "JSR",                   // jump subroutine
        "",         "RTS",                   // return subroutine
        "",         "RZR",                   // return if zero
        "",         "BNE",                   // branch if not equal to zero
        "",         "BEQ",                   // branch if equal to zero
        "TRIANGLE", "T[ra][ra]",             // triangle absolute coords
        "RECT",     "RCT",                   // rectangle [ w, h ] 
        "CIRCLE",   "CIR",                   // circle
        "ELLIPSE",  "ELL",                   // ellipse
        "",         "ARC",                   // a,b, angle1, angle2 from center current position
        "",         "SC",                    // stroke (color)
        "",         "SW",                    // stroke-width
        "",         "F",                     // fill
        // These commands are copied from 
        // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d#path_commands
        "",         "m",                     // relative coordinates move [dx,dy]
        "",         "M",                     // absolute coordinates move x,y
        "",         "l",                     // relative coordinates line
        "",         "L",                     // absolute coordinate line
        "",         "T",                     // absolute coordinates triangle [ x1,y1,x2,y2 ]
        "",         "t",                     // relative coordinates triangle [ dx1,dy1,dx2,dy2]
        "",         "a",                     // arc
        "",         "A",                     // arc
        "",         "z",                     // close path
        "",         "Z",                     // close path
        "",         "c",                     // cubic bezier
        "",         "C",
        "",         "s",                     // smooth spline
        "",         "S",
        "",         "q",                     // quadratic bezier
        "",         "Q",
        "",         "t",    
        "",         "T" ];
    
    static getVal( SVRS, k ) {
        if ( (''+k).match( SVRS['lookup']['SCOPED'] ) ) {
            k += '_' + SVRS['scopeLevel'];
        }
        return k in SVRS ? SVRS[k] : k;
    }
    static setVal( SVRS, k, v ) {
        if ( k.match( SVRS['lookup']['SCOPED'] ) ) {
            k += '_' + SVRS['scopeLevel'];
        }
        SVRS[k] = (1*v).toFixed(4);
    }
    static getXY( SVRS, itms, pc, mapto ) {
        for ( var i in mapto ) {
            var dst = mapto[i];
            SVRS[dst] = this.getVal( SVRS, itms[pc+1*i] );
        }
        return pc + mapto.length;
    }
    static offSetXY( SVRS, mapto ) {
        for ( var dst in mapto ) {
            var src = mapto[dst];
            if ( typeof SVRS[dst] === 'undefined' ) { SVRS[dst] = 0; }
            if ( typeof SVRS[src] === 'undefined' ) { SVRS[src] = 0; }
            SVRS[ dst ] = 1* SVRS[dst] + 1*SVRS[src];
        }
    }
    static setXY( SVRS, mapto ) { /* dst:src */
        for ( var dst in mapto ) {
            var src = mapto[dst];
            SVRS[ dst ] = SVRS[src];
        }
    }
    static FRESET( SVRS ) { /* Filter Reset */
        for ( var i = 1; i < 5; i++ ) {
            SVRS['XT'+i] = SVRS['X'+i];
            SVRS['YT'+i] = SVRS['Y'+i];
        }
        this.setXY( SVRS, {'RT':'R', 'RXT':'RX','RYT':'RY', 'SWT':'SW', 'XAT':'XA' } );
        /* XAT:XA ARC COMMAND FROT ADDS TO THIS PARAM*/
    }
    static FROT( SVRS, p ) {  /* Rotation around (X0,Y0) */
        var cosa = Math.cos( p['A0']*Math.PI/180);
        var sina = Math.sin( p['A0']*Math.PI/180);
        SVRS['XAT'] = 1*SVRS['XAT'] + 1*p['A0'];
        for ( var i = 1; i < 5; i++ ) {
            var x = SVRS['XT'+i]; var y = SVRS['YT'+i];
            SVRS['XT'+i] = (1*x-1*p['X0'])*cosa - (1*y-1*p['Y0'])*sina + 1*p['X0'];
            SVRS['YT'+i] = (1*x-1*p['X0'])*sina + (1*y-1*p['Y0'])*cosa + 1*p['Y0'];
        }
    }
    static FTRL( SVRS, p ) { /* Translate DX,DY */
        for ( var i = 1; i < 5; i++ ) {
            SVRS['XT'+i] = 1*SVRS['XT'+i] + 1*p['DX'];
            SVRS['YT'+i] = 1*SVRS['YT'+i] + 1*p['DY'];
        }
    }
    static FSCL( SVRS, p) { /* Scale set X0,Y0,Z0 , Z0 is in parameter here */
        /* in 3D X0,Y0 would be perspective point */
        for ( var i = 1; i < 5; i++ ) {
            SVRS['XT'+i] = ((1*SVRS['XT'+i]-1*p['X0'])/(1*p['Z0']) )+1*p['X0'];
            SVRS['YT'+i] = ((1*SVRS['YT'+i]-1*p['Y0'])/(1*p['Z0']) )+1*p['Y0'];
        }
        SVRS['RT']  = 1*SVRS['RT']  / ( 1*p['Z0']);
        SVRS['RXT'] = 1*SVRS['RXT'] / ( 1*p['Z0']); /* A in path */
        SVRS['RYT'] = 1*SVRS['RYT'] / ( 1*p['Z0']);
        SVRS['SWT'] = SVRS['SWT'] / p['Z0'];
    }
    static FREF( SVRS, p) {         /* Reflect against line  p[X0],p[Y0] - p[x1],p[y1] */
        var lx = p['X1']-p['X0'];
        var ly = p['Y1']-p['Y0'];
        var a00 = lx*lx - ly*ly;
        var a10 = 2 * lx* ly;
        var lng2 = lx*lx + ly*ly;
        for ( var i = 1; i < 5; i++ ) {
            var offX = 1*SVRS['XT'+i] -1*p['X0'];
            var offY = 1*SVRS['YT'+i] -1*p['Y0'];
            SVRS['XT'+i] = (a00*offX + a10*offY)/lng2 + 1*p['X0'];
            SVRS['YT'+i] = (a10*offX - a00*offY)/lng2 + 1*p['Y0'];
        }
    }
    static applyFilters( SVRS, FLTR ) { 
        this.FRESET( SVRS );
        for ( var i=FLTR.length-1; i>=0; i-- ) {
            var F = FLTR[i];
            F['FLTR']( SVRS, F['p'] );
        }
    }
    static svgTidy( tmpl, SVRS, FLTR ) {
        this.applyFilters(SVRS, FLTR);   
        return tmpl.replace( /\{([\w_-]+)\}/g, function(s1,s2) { return SVRS[s2]; } );
    }
    static flush( tmpl, SVRS, FLTR ) {
        SVRS['_O'] +=  SVRS['_D'].length>0 ? this.svgTidy( tmpl, SVRS, FLTR ) : '';
        SVRS['_D'] = '';
    }
    static parse( inTxt ) {     
        var regexParts = [];
        var lookup     = {};
        for ( var i = 0; i < this.lexems.length; i+=2 ) {
            var itm = this.lexems[i];
            var reg = this.lexems[i*1+1];
            itm = itm=="" ? reg : itm;
            if ( itm != reg ) {  lookup[ itm ] = reg;  }
            regexParts.push( reg );
        }
        const regexString  = '(' + regexParts.join('|') + ')';  
        console.log( regexString );
        const regex = new RegExp( regexString, 'g' );
        var itms    = inTxt.match( regex );
        var loci    = {};
        for ( var i in itms ) {
            var itm = itms[i];
            if ( itm == '#' ) {
                loci[ itms[i*1+1] ] = i;
            }
        }
        return { 'itms':itms, 'loci': loci, 'lookup': lookup };
    }
    /* BNE or JSR */
    static collectScope( pc, itms, SVRS ) {
        pc+=1;
        var callArgs = SVRS['callArgs'];
        if ( itms[pc] == '(' ) {
            pc++;
            while ( itms[pc] != ')' ) {
                if ( itms[pc] == ',' ) continue;
                var k = itms[pc];
                callArgs.push( this.getVal( SVRS, k) );
                pc++;
            }
        }
        return pc;
    }
    static loadScope( pc, itms, SVRS ) {
        var callArgs = SVRS['callArgs'];
        if ( itms[pc] == '(' ) {
            pc++;
            while ( itms[pc] != ')' ) {
                if ( itms[pc] == ',' ) continue;
                var k = itms[pc];
                if ( k.match( SVRS['lookup']['SCOPED'] ) ) {
                    k = k +'_' + SVRS['scopeLevel'];
                }
                SVRS[k] = callArgs.shift();
                pc++;
            }
            pc++;
        }
        return pc;
    }
    static run( inTxt ) {
        if ( !inTxt.startsWith('SVG') ) return '';

        var tplText       = '<text id="{ID}" x="{XT1}" y="{YT1}" stroke="{SC}" stroke-width="{SWT}">{TXT}</text>';
        var tplPath       = '<path id="{ID}" d="{_D}" stroke="{SC}" stroke-width="{SWT}" fill="{F}" />';
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

        var parse  = this.parse( inTxt );
        var itms   = parse['itms'];
        var loci   = parse['loci'];
        var lookup = parse['lookup'];
        var FLTR   = [];
        var JMPS   = [];  /* Jump stack */
        var SVRS   = {  
            '_O' : '<svg xmlns="http://www.w3.org/2000/svg" width="'+itms[1]+'" height="'+itms[2]+'">',  
            '_D' : '',       'w0' : itms[1],   'h0'         : itms[2],       'x0' : itms[1],        'y0' : itms[2],
            'X0' : 0,        'Y0' : 0,         'Z0'         : 0,             'A0' : 0,              'X1' : 0,
            'Y1' : 0,        'Z1' : 0,         'SC'         : 'BLACK',       'F'  : 'transparent',  'SW' : '1', 
            'ID' : '',                         'lookup'     : lookup,    
            'callArgs': [],                   'scopeLevel' : 0,
        }; /* System variables hash */
        var _D     = '';
        var start  = 0;
        var infiniteLoopProtect = 0;
        var pc     = 3;
        var pc =  loci['"main"'] ? loci['"main"'] : 3;

        while ( pc < itms.length ) {
            var itm = itms[pc++];
            // console.log( (pc-1) + ' itm:' +  itm + ' next:' + itms[pc] + ' inf loop:' + infiniteLoopProtect );
            if ( itm == '#' ) {
                pc = this.loadScope(pc+1, itms, SVRS );         /* id       entering routine       */
            } else if ( itm == 'BNE' ) {                        /* Branch on not equal to zero */
                var v = this.getVal( SVRS, itms[pc+1] );
                if ( v > 0 ) {
                    pc = loci[ itms[pc] ]*1;                    // pc == # location 
                } else {                                        // skipping variable
                    pc +=2;
                }
            } else if ( itm == 'JSR' ) {                        /* Jump SubRoutine   */
                var _pc = this.collectScope( pc, itms, SVRS );
                JMPS.push( _pc );
                SVRS['scopeLevel']++;
                pc = loci[ itms[pc] ];
            } else if ( itm == 'RTS' ) {                        /* ReTurn Subroutine */
                SVRS['scopeLevel']--;
                pc = JMPS.pop();
            } else if ( itm =='RZR' ) {                         /* Return subroutine if ZeRo ! */
                var v = this.getVal( SVRS, itms[pc] );
                pc++;
                if ( v*1 == 0 ) {
                    SVRS['scopeLevel']--;
                    pc = JMPS.pop();  
                } 
            } else if ( itm.match( /^\$/) ) {                   /* variable global or scoped */
                var v0 = this.getVal( SVRS, itm );               
                if ( itms[pc]        == '=' ) {   
                    var v = this.getVal( SVRS, itms[pc+1]);     /* Enable assign from another variable */
                    this.setVal( SVRS, itm, v);
                } else if ( itms[pc] == '+=' ) {
                    var v1 = this.getVal( SVRS, itms[pc+1]);               
                    this.setVal( SVRS, itm, 1*v0+1*v1 );        // does not work without coercion
                } else if ( itms[pc] == '-=' ) {
                    var v1 = this.getVal( SVRS, itms[pc+1]);               
                    this.setVal( SVRS, itm, 1*v0-1*v1 );
                } else if ( itms[pc] == '*=' ) {
                    var v1 = this.getVal( SVRS, itms[pc+1]);               
                    this.setVal( SVRS, itm, v0*v1 );
                } else if ( itms[pc] == '/=' ) {   
                    var v1 = this.getVal( SVRS, itms[pc+1]);               
                    this.setVal( SVRS, itm, v0/v1 );
                } else if ( itms[pc] == '++' ) {             
                    this.setVal( SVRS, itm, v0*1+1 );   pc--;
                } else if ( itms[pc] == '--' ) {             
                    this.setVal( SVRS, itm, v0*1-1 );   pc--;
                } else if ( itms[pc].match( lookup['NUMBER'] ) ) { 
                    SVRS[itm] = 1*itms[pc];             pc--;
                } 
                pc+=2;
            } else {  
                if ( itm == 'm' || itm == 'M' ) {
                    pc  = this.getXY( SVRS, itms, pc, ['X2','Y2'] ); 
                    itm == 'm' ? this.offSetXY( SVRS, { 'X2':'X1','Y2':'Y1'} ) :0;
                    _D  = this.svgTidy( tplPathMove, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X2', 'Y1':'Y2', 'MX1':'X2', 'MY1':'Y2' } ); /* MX1 MY1 used by Z command */
                } else if ( itm == 'l' || itm == 'L' ) {
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2'] ); 
                    itm == 'l' ? this.offSetXY( SVRS,{'X2':'X1','Y2':'Y1'}) :0;
                    _D = this.svgTidy( tplPathLineTo, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'Z' || itm == 'z' ) {  
                    _D = 'Z ';                                  
                    this.setXY( SVRS, {'X1':'MX1', 'Y1':'MY1'} );
                } else if ( itm == 'a' || itm == 'A' ) {
                    pc = this.getXY( SVRS, itms, pc, ['RX','RY','XA','LA','SF','X3','Y3'] ); 
                    itm == 'a' ? this.offSetXY( SVRS,{'X3':'X1', 'Y3':'Y1' }) :0;
                    _D = this.svgTidy( tplPathArc, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 'q' || itm == 'Q' ) {
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 'q' ? this.offSetXY( SVRS,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    _D = this.svgTidy( tplPathQ, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 't' || itm == 'T' ) {
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2'] ); 
                    itm == 't' ? this.offSetXY( SVRS,{'X2':'X1','Y2':'Y1'}) :0;
                    _D = this.svgTidy( tplPathQT, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'c' || itm == 'C' ) {                    /* Cubic bezier */
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2','X3','Y3','X4','Y4'] ); 
                    itm == 'c' ? this.offSetXY( SVRS,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    _D = this.svgTidy( tplPathC, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X4', 'Y1':'Y4'} );
                } else if ( itm == 's' || itm == 'S' ) {                    /* smooth spline */
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 's' ? this.offSetXY( SVRS,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    _D = this.svgTidy( tplPathCS, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X3', 'Y1':'Y3'} );
                /* our own convenience functions */
                } else if ( itm == 'RCT' ) {                                /* Rect  width, height */
                    pc = this.getXY( SVRS, itms, pc, ['DX','DY'] );         /* width height */ 
                    this.setXY(SVRS, { 'X2':'X1', 'X3':'X1', 'X4':'X1', 'Y2':'Y1', 'Y3':'Y1', 'Y4':'Y1' } );
                    this.offSetXY( SVRS, { 'X2':'DX', 'X3':'DX', 'Y3':'DY', 'Y4':'DY' } );
                    _D = this.svgTidy( tplPathRect, SVRS, FLTR );
                } else if ( itm == 'ELL' || itm == 'CIR' ) {                /* ELL, Ellipse, CIR, Circle */
                    this.flush( tplPath, SVRS, FLTR );
                    pc = this.getXY( SVRS, itms, pc, ['RX'] );              // set SVRS['RX'] == ...
                    SVRS['RY'] = SVRS['RX'];
                    pc = ( itm == 'ELL') ? this.getXY(SVRS, itms, pc, ['RY']) : pc;
                    SVRS['XA'] = 0;
                    SVRS['X1'] = 1*SVRS['X1'] - 1*SVRS['RX'];  
                    SVRS['X2'] = 1*SVRS['X1'] + 2*SVRS['RX'];  
                    SVRS['Y2'] = 1*SVRS['Y1'];  
                    _D = this.svgTidy( tplPathCE, SVRS, FLTR );
                    SVRS['X1'] = 1*SVRS['X1'] + 1*SVRS['RX'];  
                } else if ( itm == 'ARC' ) {                                /* Arc X - special - rx,ry,angle start, angle end. Differs from A in path */
                    pc = this.getXY( SVRS, itms, pc, ['RX','RY','AS','AE'] );
                    SVRS['AE'] = +SVRS['AE'] < +SVRS['AS'] ? +SVRS['AE'] + 360 : +SVRS['AE'];  
                    var da = +SVRS['AE'] - SVRS['AS'];
                    SVRS['LA'] = da > 180 ? 1 : 0;
                    SVRS['X2'] = +SVRS['X1'] + SVRS['RX'] * Math.cos( SVRS['AS']* Math.PI / 180 );
                    SVRS['Y2'] = +SVRS['Y1'] + SVRS['RY'] * Math.sin( SVRS['AS']* Math.PI / 180 );
                    SVRS['X3'] = +SVRS['X1'] + SVRS['RX'] * Math.cos( SVRS['AE']* Math.PI / 180 );
                    SVRS['Y3'] = +SVRS['Y1'] + SVRS['RY'] * Math.sin( SVRS['AE']* Math.PI / 180 );
                    _D = this.svgTidy( tplPathA, SVRS, FLTR );
                } else if ( itm.match(/T[ra][ra]/ ) ) {                     /* Triangle TODO:semantic not good fix it */
                    pc = this.getXY( SVRS, itms, pc, ['X2','Y2','X3','Y3','X4','Y4'] ); 
                    itm.match( /^Tr\w/ ) ? this.offSetXY( SVRS, { 'X2':'X1', 'Y2':'Y1'} ) : 0;
                    itm.match( /^T\wr/ ) ? this.offSetXY( SVRS, { 'X3':'X2', 'X4':'X2', 'Y3':'Y2', 'Y4':'Y2'} ) : 0;
                    SVRS['_D'] += this.svgTidy( tplTriangle, SVRS, FLTR );  
                    this.flush( tplPath, SVRS, FLTR );
                    this.setXY( SVRS, {'X1':'X2', 'Y1':'Y2', 'MX1':'X2', 'MY1':'Y2' } ); /* MX1 MY1 used by Z command */
                } else if ( itm == 'TXT' ) {
                    this.flush( tplPath, SVRS, FLTR );
                    SVRS['TXT'] = itms[pc++];
                    SVRS['TXT'] = SVRS['TXT'].charAt(0)=='"' ? SVRS['TXT'].replace(/"/g, '') : 
                    this.getVal(SVRS, SVRS['TXT']);                             /* txt may be a variable */
                    SVRS['_O'] += this.svgTidy( tplText, SVRS, FLTR );
                } else if ( itm == 'F' || itm == 'SC' || itm == 'SW' || itm == 'ID' ) { /*F fill, SC stroke color */
                    this.flush( tplPath, SVRS, FLTR );
                    SVRS[itm] = itms[pc].replace( /"/g, '' );
                    pc++;     
                } else {
                    this.flush( tplPath, SVRS, FLTR );
                    if ( itm == 'ROT' ) {                                       /* Filter rotate x,y,a */ 
                        pc = this.getXY( SVRS, itms, pc, ['X0','Y0','A0'] ); 
                        FLTR.push( { 'FLTR': this.FROT, p:{ 'X0':SVRS['X0'], 'Y0':SVRS['Y0'], 'A0':SVRS['A0'] } } );
                    } else if ( itm == 'TRL' ) {                                /* Filter translate dx, dy */ 
                        pc = this.getXY( SVRS, itms, pc, ['DX','DY'] ); 
                        FLTR.push( { 'FLTR': this.FTRL, p:{ 'DX':SVRS['DX'], 'DY':SVRS['DY'] } } );
                    } else if ( itm == 'SCL' ) {                                /* Filter scale */
                        pc = this.getXY( SVRS, itms, pc, ['X0','Y0','Z0'] ); 
                        FLTR.push( { 'FLTR': this.FSCL, p:{ 'X0':SVRS['X0'], 'Y0':SVRS['Y0'], 'Z0':SVRS['Z0'] } } );
                    } else if ( itm == 'REF' ) {                                /* Filter reflect x,y line through origin */
                        var p = {};
                        p['lookup'] = SVRS['lookup'];
                        pc = this.getXY( p, itms, pc, ['X0','Y0', 'X1','Y1'] ); // n.b. p instead of SVRS
                        FLTR.push( { 'FLTR': this.FREF, 'p':p } );
                    } else if ( itm =='POP' ) {                                 /* Filter pop. Removes last filter    */
                        FLTR.pop();
                    } else if ( itm =='SHIFT' ) {                               /* Filter shift. Removes first filter */
                        FLTR.shift();
                    }
                }
            }
            SVRS['_D'] += _D;
            _D = '';
            if ( infiniteLoopProtect++ > 4999 ) return 'Iteration limit. Max 5000 iterations.';
        }
        this.flush( tplPath, SVRS, FLTR );
        /* Tidy. Three decimal precision should suffice */    
        var _O = SVRS['_O'].replace( /(\.\d{3})\d+/g, function(s1,s2) { return s2; } );
        return _O + '</svg>';
    }
}
