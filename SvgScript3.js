class SvgScript {
    static regex = {
        'number' : '-?(\\d+\\.\\d+|\\d+)',
        'scoped' : '\\$[a-zåäö]+[0-9]*',  
        'global' : '\\$[A-ZÅÄÖ]+[0-9]*',         
    }

    /* **************************************** */
    /* works with arrays ! */
    /* **************************************** */
    static getVal(SYSTEM, itms, pc ) {  
        var k = itms[pc];
        if ( (''+k).match( this.regex['scoped'] ) ) {
            k += '_' + SYSTEM['scope'];
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
            k += '_' + SYSTEM['scope'];
        }
        SYSTEM[k] = v;
    }
    static getXY(SYSTEM, itms, pc, mapto ) { // TODO: will not work with arrays
        for ( var i in mapto ) {
            SYSTEM[ mapto[i] ] = this.getVal(SYSTEM, itms, pc+1*i );
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
    static parse( inTxt ) {     
        var itms    = inTxt.match( /(SVG|ID|#|".*?"|REFLECTION|PERSPECTIVE|\+\+|\+=|\+|-=|--|-?(\d+\.\d+|\d+)|-|\*=|\*|\/=|\/|=|==|\(|\)|\$[a-zåäö]+[0-9]{0,5}|\$[A-ZÅÄÖ]+[0-9]{0,5}|\[|]|TEXT|CIRCLE|ELLIPSE|LINE|POLY|TRI(ANGLE)?|CLASS|RECT|SCALE|ROTATE|TRANSLATE|POP|PATH|PEND|SHIFT|JSR|RTS|RZR|BNE|BEQ|ARC|STROKE|WIDTH|FILL|m|M|l|L|T|t|a|A|z|Z|c|C|s|S|q|Q|t|T)/g );
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
                k = k +'_' + SYSTEM['scope'];
            }
            SYSTEM[k] = callArgs.shift();
            pc++;
        }
        return pc+1;
    }
    static fillTemplate(SYSTEM, tmpl ) {
        SYSTEM['class'] = SYSTEM['CLASS'] != '' ? ` class="${SYSTEM['CLASS']}"` : '';
        SYSTEM['id'] = SYSTEM['ID'] != '' ? `id="${SYSTEM['ID']}"` : '';
        return tmpl.replace( /\{([\w_-]+)\}/g, function(s1,s2) { return SYSTEM[s2]; } );
    }
    static addPath( SYSTEM, tmpl ) {
        SYSTEM['pathA'].push( this.fillTemplate(SYSTEM, tmpl ) );
    }
    static addToOut( SYSTEM, tmpl ) {
        SYSTEM['OUT']  +=  this.fillTemplate(SYSTEM, tmpl );
    }
    static movePathToOut(SYSTEM, tmpl ) {
        var pA = SYSTEM['pathA'];
        console.log( 'paLength:' +  pA.length );
        if ( pA.length == 0 ) return;
        if ( 1==0 && pA.length == 1 && pA[0].charAt(0) == 'M' ) {
            console.log( SYSTEM['pathA'] );
           SYSTEM['pathA'] = [];
           return;
        }
        SYSTEM['path']  = SYSTEM['pathA'].join(' ');
        SYSTEM['pathA'] = [];
        if ( SYSTEM['path'].length > 0 ) {
            SYSTEM['OUT']  +=  this.fillTemplate(SYSTEM, tmpl );
        }
    }
    static run( inTxt ) {
        if ( !inTxt.startsWith('SVG') ) return '';
        var tplText       = '<text {id}{class} x="{X1}" y="{Y1}" stroke="{STROKE}" stroke-width="{WIDTH}">{TEXT}</text>';
        var tplPath       = '<path {id}{class} d="{path}" stroke="{STROKE}" stroke-width="{WIDTH}" fill="{FILL}" />';
        var tplTriangle   = ' L {X3} {Y3} L {X4} {Y4} Z ';
        var tplPathCE     = ' M{X1} {Y1} A {RX} {RY} {XA} 1 1 {X2} {Y2} A {RX} {RY} {XA} 1 1 {X1} {Y1} M{X2} {Y2} '; /* circle ellipse */
        var tplPathA      = ' M{X2} {Y2} A {RX} {RY} 0 {LA} 1 {X3} {Y3} ';
        var tplPathRect   = ' L {X2} {Y2} L {X3} {Y3} L {X4} {Y4} Z ';
        var tplPathMove   = 'M{X2} {Y2} ';
        var tplPathLineTo = 'L{X2} {Y2} ';
        var tplPathArc    = 'A{RX} {RY} {XA} {LA} {SF} {X3} {Y3} '; 
        var tplPathC      = 'C{X2} {Y2} {X3} {Y3} {X4} {Y4} '; 
        var tplPathCS     = 'S{X2} {Y2} {X3} {Y3} '; 
        var tplPathQ      = 'Q{X2} {Y2} {X3} {Y3} '; 
        var tplPathQT     = 'T{X2} {Y2} '; 

        var tplGroupRotate     = '<g transform="rotate({A0} {X0} {Y0})">'; 
        var tplGroupTranslate  = '<g transform="translate({X0} {Y0})">'; 
        var tplGroupScale      = '<g transform="scale({SX} {SY})">'; 
        var tplGroupReflection = '<g transform="translate({AX} {AY}) rotate({A0} 0 0) scale(1 -1) rotate({NA0} 0 0) translate({NAX} {NAY})">'; 
        var tplGroupPerspective= '<g transform="scale({Z0} {Z0})" transform-origin="{X0} {Y0}">'; 
        var tplGroupEnd       = '</g>'; 
        // skew  

        var [itms, loci]  = this.parse( inTxt );
        var returnLoci    = [];  /* Jump stack */
        var SYSTEM   = {  
            'OUT' : '<svg viewBox="0 0 '+itms[1]+' '+itms[2]+'" xmlns="http://www.w3.org/2000/svg" width="'+itms[1]+'" height="'+itms[2]+'">',  
            'path' : '',            'pathA' : [],  
            'w0'      : itms[1],    'h0'    : itms[2], 'x0' : itms[1], 'y0' : itms[2],
            'X0'      : 0,          'Y0'    : 0,       'Z0' : 0,       'A0' : 0,      
            'X1'      : 0,          'Y1'    : 0,       'Z1' : 0,       
            'STROKE'  : 'BLACK',    'FILL'  : 'transparent',           
            'WIDTH'   : '1',        'ID'    : '',       'CLASS' : '',    
            'callArgs': [],         'scope' : -1,      
        }; /* System variables hash */
        var start       = 0;
        var loopProtect = 0;
        var pc          = 3;
        var pc =  loci['"main"'] ? loci['"main"'] : 3;
        while ( pc < itms.length ) {
            var itm = itms[pc++];
            console.log( (pc-1) + ' itm:' +  itm + ' next:' + itms[pc] );
            if ( itm == '#' ) {
                pc = this.injectScope(SYSTEM, pc+1, itms );         /* id       entering routine       */
            } else if ( itm == 'JSR' ) {                        /* Jump SubRoutine   */
                var _pc = this.collectScope(SYSTEM, pc+1, itms );
                returnLoci.push( _pc );
                SYSTEM['scope']++;
                pc = loci[ itms[pc] ];
            } else if ( itm == 'RTS' ) {                        /* ReTurn Subroutine */
                SYSTEM['scope']--;
                pc = returnLoci.pop();
            } else if ( itm =='RZR' ) {                         /* Return subroutine if ZeRo ! */
                var v = this.getVal(SYSTEM, itms, pc );
                pc = SYSTEM['nextpc'];
                if ( v*1 == 0 ) {
                    SYSTEM['scope']--;
                    pc = returnLoci.pop()+1;  
                }     
            } else if ( itm == 'BNE' ) {                            /* Branch on not equal to zero */
                var v = this.getVal(SYSTEM, itms, pc+1 );
                if ( v > 0 ) {
                    pc = loci[ itms[pc] ]*1;                        // pc == # location 
                } else {                                            // skipping variable
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
                        if ( itms[pc+1]  == '[' ) { // declaring array
                            pc = this.collectScope(SYSTEM, pc+1, itms);
                            if ( itm.match( this.regex['scoped'] ) ) {
                                SYSTEM[itm + '_' + SYSTEM['scope']] = SYSTEM['callArgs'];
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
                    this.addPath( SYSTEM, tplPathMove );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2', 'MX1':'X2', 'MY1':'Y2' } ); /* MX1 MY1 used by Z command */
                } else if ( itm == 'l' || itm == 'L' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2'] ); 
                    itm == 'l' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1'}) :0;
                    this.addPath( SYSTEM, tplPathLineTo );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'Z' || itm == 'z' ) {  
                    SYSTEM['pathA'].push(' ' + itm + ' ');                                  
                    this.setXY(SYSTEM, {'X1':'MX1', 'Y1':'MY1'} );
                } else if ( itm == 'a' || itm == 'A' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['RX','RY','XA','LA','SF','X3','Y3'] ); 
                    itm == 'a' ? this.offSetXY(SYSTEM,{'X3':'X1', 'Y3':'Y1' }) :0;
                    this.addPath( SYSTEM, tplPathArc );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 'q' || itm == 'Q' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 'q' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    this.addPath( SYSTEM, tplPathQ );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 't' || itm == 'T' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2'] ); 
                    itm == 't' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1'}) :0;
                    this.addPath( SYSTEM, tplPathQT );
                    this.setXY(SYSTEM, {'X1':'X2', 'Y1':'Y2'} );
                } else if ( itm == 'c' || itm == 'C' ) {                    /* Cubic bezier */
                    pc  = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3','X4','Y4'] ); 
                    itm == 'c' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    this.addPath( SYSTEM, tplPathC );
                    this.setXY(SYSTEM, {'X1':'X4', 'Y1':'Y4'} );
                } else if ( itm == 's' || itm == 'S' ) {                    /* smooth spline */
                    pc = this.getXY(SYSTEM, itms, pc, ['X2','Y2','X3','Y3'] ); 
                    itm == 's' ? this.offSetXY(SYSTEM,{'X2':'X1','Y2':'Y1','X3':'X1','Y3':'Y1'}) :0;
                    this.addPath( SYSTEM, tplPathCS );
                    this.setXY(SYSTEM, {'X1':'X3', 'Y1':'Y3'} );
                } else if ( itm == 'RECT' ) {                                /* Rect  width, height */
                    pc = this.getXY(SYSTEM, itms, pc, ['DX','DY'] );         /* width height */ 
                    this.setXY(SYSTEM, { 'X2':'X1', 'X3':'X1', 'X4':'X1', 'Y2':'Y1', 'Y3':'Y1', 'Y4':'Y1' } );
                    this.offSetXY(SYSTEM, { 'X2':'DX', 'X3':'DX', 'Y3':'DY', 'Y4':'DY' } );
                    this.addPath( SYSTEM, tplPathRect );
                } else if ( itm == 'ELLIPSE' || itm == 'CIRCLE' ) {                /* ELL, Ellipse, CIR, Circle */
                    pc = this.getXY(SYSTEM, itms, pc, ['RX'] );              // set SYSTEM['RX'] == ...
                    SYSTEM['RY'] = SYSTEM['RX'];
                    pc = ( itm == 'ELLIPSE') ? this.getXY(SYSTEM, itms, pc, ['RY']) : pc;
                    SYSTEM['XA']  = 0;
                    SYSTEM['X1']  = 1*SYSTEM['X1'] - 1*SYSTEM['RX'];  
                    SYSTEM['X2']  = 1*SYSTEM['X1'] + 2*SYSTEM['RX'];  
                    SYSTEM['Y2']  = 1*SYSTEM['Y1'];  
                    this.addPath( SYSTEM, tplPathCE );
                    console.log( SYSTEM['path'] );
                    SYSTEM['X1']  = 1*SYSTEM['X1'] + 1*SYSTEM['RX'];  
                } else if ( itm == 'ARC' ) {       /* Arc X - special - rx,ry,angle start, angle end. Differs from A in path */
                    pc = this.getXY(SYSTEM, itms, pc, ['RX','RY','AS','AE'] );
                    SYSTEM['AE'] = +SYSTEM['AE'] < +SYSTEM['AS'] ? +SYSTEM['AE'] + 360 : +SYSTEM['AE'];  
                    var da = +SYSTEM['AE'] - SYSTEM['AS'];
                    SYSTEM['LA'] = da > 180 ? 1 : 0;
                    SYSTEM['X2'] = 1*SYSTEM['X1'] + SYSTEM['RX'] * Math.cos(SYSTEM['AS']* Math.PI / 180 );
                    SYSTEM['Y2'] = 1*SYSTEM['Y1'] + SYSTEM['RY'] * Math.sin(SYSTEM['AS']* Math.PI / 180 );
                    SYSTEM['X3'] = 1*SYSTEM['X1'] + SYSTEM['RX'] * Math.cos(SYSTEM['AE']* Math.PI / 180 );
                    SYSTEM['Y3'] = 1*+SYSTEM['Y1'] + SYSTEM['RY'] * Math.sin(SYSTEM['AE']* Math.PI / 180 );
                    this.addPath( SYSTEM, tplPathA );
                } else if ( itm == 'POLY' || itm == 'POLYGON' ) {
                    /* Triangle TODO:semantic not good fix it */
                    var x,y;
                    var poly = ''; 
                    while ( typeof (x=this.getVal( SYSTEM, itms, pc++) ) == 'number' ) {
                        y = this.getVal( SYSTEM, itms, pc++ ); // trust the force!!!
                        poly += ` l${x},${y}`;
                    }
                    SYSTEM['path'] += poly;
                    this.setXY(SYSTEM, {'X0':x, 'Y0':y } ); 
                } else if ( itm == 'TRIANGLE' ) { 
                    pc = this.getXY(SYSTEM, itms, pc, ['X3','Y3','X4','Y4'] ); 
                    console.log( '---------------' );
                    this.addPath( SYSTEM, tplTriangle );
                    console.log( SYSTEM['path']  );
                } else if ( itm == 'TEXT' ) {
                    SYSTEM['TEXT'] = itms[pc]; 
                    if ( SYSTEM['TEXT'].charAt(0) == '"' ) {
                        SYSTEM['TEXT'] = SYSTEM['TEXT'].replace(/"/g, '');
                        pc++;
                    } else {
                        SYSTEM['TEXT'] = this.getVal(SYSTEM, itms, pc );
                        pc = SYSTEM['nextpc'];
                    }
                    SYSTEM['OUT'] += this.fillTemplate(SYSTEM, tplText );
                } else if ( itm == 'FILL' || itm == 'STROKE' || itm == 'WIDTH' || itm == 'ID' ) { /*F fill, SC stroke color */
                    this.movePathToOut(SYSTEM, tplPath );
                    var v = this.getVal( SYSTEM, itms, pc );
                    if ( typeof v === 'string' ) v.replace( /"/g, '' ); // v may be a number 22 dec 2024 
                    SYSTEM[itm] = v;
                    pc = 1*SYSTEM['nextpc'];
                } else if ( itm == 'CLASS' ) {
                    var v = this.getVal( SYSTEM, itms, pc );
                    SYSTEM[itm] = v.replace( /"/g, '' );
                    pc = 1*SYSTEM['nextpc'];
                } else if ( itm =='ROTATE' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['A0','X0','Y0'] ); 
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupRotate );
                } else if ( itm == 'TRANSLATE' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X0','Y0'] ); 
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupTranslate );
                } else if ( itm == 'SCALE' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['SX','SY'] ); 
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupScale );
                } else if ( itm == 'REFLECTION' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['AX','AY', 'BX','BY'] );
                    var dx = 1*SYSTEM['BX'] - 1*SYSTEM['AX'];
                    var dy = 1*SYSTEM['BY'] - 1*SYSTEM['AY'];
                    SYSTEM['NAX'] = -SYSTEM['AX'];
                    SYSTEM['NAY'] = -SYSTEM['AY'];
                    SYSTEM['A0']  = Math.atan2( dy, dx ) * 180/Math.PI;
                    console.log( 'dx dy a0:' + dx + ' ' + dy + ' ' + SYSTEM['A0'] );
                    SYSTEM['NA0'] = -SYSTEM['A0'];
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupReflection );
                } else if ( itm == 'PERSPECTIVE' ) {
                    pc = this.getXY(SYSTEM, itms, pc, ['X0','Y0', 'D0'] );
                    SYSTEM['Z0'] = 1 / SYSTEM['D0'];
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupPerspective );
                } else if ( itm =='POP' ) {                                 /* Filter pop. Removes last filter    */
                    this.movePathToOut(SYSTEM, tplPath );
                    this.addToOut( SYSTEM, tplGroupEnd );
                }
            }
            if ( loopProtect++ > 4999 ) return 'Iteration limit. Max 5000 iterations.';
        }
        this.movePathToOut(SYSTEM, tplPath );

        SYSTEM['OUT'] = SYSTEM['OUT'].replace( /(\.\d{3})\d+/g, function(s1,s2) { return s2; } );  /* ARC ... */
        return SYSTEM['OUT'] + '</svg>';
    }
}

