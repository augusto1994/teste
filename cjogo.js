var tela;
var cv;

var imgs = [];
var mapas = [];
var imgs_by_arq = {};

var arquivos_carregados = 0;
var arquivos_para_carregar = 0;
var arquivos_para_carregar_ok = false;

var _processa = function() { };
var _carregou_mapa = function() { };
var _animacao = function() { };

var _animacao_counter = 0;

var teclado = { left:false, right:false, up:false, down:false, space:false };

var _lista_animacoes = [];
var _lista_caminhos = [];

var _camera = {
    ox: 0, oy: 0,
    tiles_x: 20, tiles_y: 15,
    seguindo_sprite: null
};

var _modo_debug = false;
var _debug_coord = {x:0, y:0};
var _debug_fonte = "14px Ubuntu Mono";



//
// 1 - inicialização e carregamento
//
//
/////////////////////////////////////////////////////////////////


function inicializa(processa_func, carregou_mapa_func, animacao_func)
{
    _processa = processa_func;
    _carregou_mapa = carregou_mapa_func;
    _animacao = animacao_func;

    tela = document.getElementById("tela");
    cv = tela.getContext("2d");

    cv.imageSmoothingEnabled = false;
    cv.mozImageSmoothingEnabled = false;

    window.addEventListener("keydown", on_keydown);
    window.addEventListener("keyup", on_keyup);
    tela.addEventListener("mousemove", on_mousemove);

    document.body.style.margin = "0";
    document.body.style.backgroundColor = "black";
    tela.style.position = "absolute";
    tela.style.left = "50%";
    tela.style.top = "50%";
    tela.style.transform = "translate(-50%,-50%)";

    arquivos_carregados = 0;
    arquivos_para_carregar = 0;
    arquivos_para_carregar_ok = false;
}


function carrega_imagem(arq)
{
    arquivos_para_carregar++;

    var img = new Image();
    img.onload = function ()
    {
        imgs.push( img );

        arquivos_carregados++;
        _carregou_mais_um();
    };

    imgs_by_arq[arq] = img;
    img.src = arq;
}

function carrega_imagens(arqs)
{
    for (var i = 0; i < arqs.length; i++)
        carrega_imagem( arqs[i] );
}

function carrega_mapa(arq)
{
    arquivos_para_carregar++;

    var x = new XMLHttpRequest();
    x.onreadystatechange = function()
    {
        if (x.readyState == 4 && x.status == 200)
        {
            //var mdata = x.responseXML;
            var parser = new DOMParser();
            var mdata = parser.parseFromString( x.responseText, "application/xml" );

            if (mdata == null)
            {
                alert("Erro no processamento XML do mapa");
                return;
            }

            _processa_mapa_dados( mdata );

            arquivos_carregados++;
            _carregou_mais_um();
        }
    };

    try
    {
        x.open("GET", arq, true);
        x.send();
    } catch(err)
    {
        alert("Erro ao carregar mapa: " + err.message);
    }
}

function pronto()
{
    arquivos_para_carregar_ok = true;
}

function on_keydown(e)
{
    if ( e.keyCode == 37 ) teclado.left = true;
    else if ( e.keyCode == 39 ) teclado.right = true;
    else if ( e.keyCode == 38 ) teclado.up = true;
    else if ( e.keyCode == 40 ) teclado.down = true;
    else if ( e.keyCode == 32 ) teclado.space = true;

    // CTRL + D -> normalmente adiciona bookmark, aqui ativa/desativa Debug
    if (e.ctrlKey && e.keyCode == 68)
    {
        modo_debug( !_modo_debug );
        e.preventDefault();
    }        

    _executa_processa();
}

function on_keyup(e)
{
    if ( e.keyCode == 37 ) teclado.left = false;
    else if ( e.keyCode == 39 ) teclado.right = false;
    else if ( e.keyCode == 38 ) teclado.up = false;
    else if ( e.keyCode == 40 ) teclado.down = false;
    else if ( e.keyCode == 32 ) teclado.space = false;

    _executa_processa();
}

function on_mousemove(e)
{
    if ( !_modo_debug ) return;
    
    var r = tela.getBoundingClientRect();
    var px = e.clientX - r.left;
    var py = e.clientY - r.top;
    
    var m = _get_mapa();
    var tx = parseInt( px / m.tw );
    var ty = parseInt( py / m.th );
    
    if (_debug_coord.x != tx || _debug_coord.y != ty)
    {
        _debug_coord.x = tx;
        _debug_coord.y = ty; 
        _executa_desenho();
    } 
}

function modo_debug(enabled)
{
    _modo_debug = enabled;
}





//
// 2 - leitura e preparação dos dados
//
//
/////////////////////////////////////////////////////////////////


function _carregou_mais_um()
{
    if (arquivos_para_carregar_ok && arquivos_carregados >= arquivos_para_carregar)
        _carregou_tudo();
}

function _carregou_tudo()
{
    _carregou_mapa();

    _executa_processa();

    setInterval(function() {
        requestAnimationFrame( _executa_animacao );
    }, 150);
}

function _processa_mapa_dados(mdata)
{
    var tag_map = mdata.getElementsByTagName("map")[0];

    var mapa = {};
    mapa.w = parseInt( tag_map.getAttribute("width") );
    mapa.h = parseInt( tag_map.getAttribute("height") );
    mapa.tw = parseInt( tag_map.getAttribute("tilewidth") );
    mapa.th = parseInt( tag_map.getAttribute("tileheight") );
    mapa.camadas = [];
    mapa.sprites = [];
    mapa.tilesets = [];
    mapa.tile_infos = [];

    _camera.tiles_x = tela.width / mapa.tw;
    _camera.tiles_y = tela.height / mapa.th;

    var tilesets = mdata.getElementsByTagName("tileset");
    for (var i = 0; i < tilesets.length; i++)
    {
        var ts = {
            arq: null,
            img: null
        };
        mapa.tilesets.push(ts);

        var img_tag = tilesets[i].getElementsByTagName("image")[0];
        ts.arq = img_tag.getAttribute("source");

        var n = (parseInt( img_tag.getAttribute("width") ) / mapa.tw) *
            (parseInt( img_tag.getAttribute("height") ) / mapa.th);

        for (var j = 0; j < n; j++)
        {
            var tile_info = {
                tipo: null,
                tileset: i,
                index_in_tileset: j
            };
            mapa.tile_infos.push( tile_info );
        }
    }

    var layers = mdata.getElementsByTagName("layer");
    for (var i = 0; i < layers.length; i++)
    {
        var camada = {
            grid: []
        };
        mapa.camadas.push( camada );

        var layer = layers[i];
        var tiles = layer.getElementsByTagName("tile");
        for (var j = 0; j < tiles.length; j++)
        {
            var gid = parseInt( tiles[j].getAttribute("gid") ) - 1;
            camada.grid.push( gid );
        }
    }


    var objs = mdata.getElementsByTagName("object");
    for (var i = 0; i < objs.length; i++)
    {
        var gid = parseInt( objs[i].getAttribute("gid") ) - 1;
        var nome = objs[i].getAttribute("name");
        var tx = parseInt( objs[i].getAttribute("x") ) / mapa.tw;
        var ty = parseInt( objs[i].getAttribute("y") ) / mapa.th - 1;

        if (nome == null)
        {
            alert("Erro: mapa com sprite na posição (" + tx + ", " + ty + ") com nome nulo");
            return;
        }

        // por default, os sprites são criados apontando pra 'sprites.png'
        var s = _cria_sprite(nome, "sprites.png", tx, ty);
        mapa.sprites.push( s );
        
        s.im = mapa.tile_infos[gid].index_in_tileset;

        var props = objs[i].getElementsByTagName("property");
        for (var j = 0; j < props.length; j++)
        {
            var prop = props[j];
            var pnome = prop.getAttribute("name");
            var pvalor = prop.getAttribute("value");

            s.extras[pnome] = pvalor;
        }
    }

    mapas.push( mapa );
}

function _cria_sprite(nome, arq, x, y)
{
    var s = {
        nome:nome,
        arq:arq,
        im:0,
        
        x:x, y:y,
        w:1, h:1,

        aparece:true,
        last_dx:0, last_dy:0,
        desenha_acima_dos_outros: false,

        alpha:1,
        flipx: false, flipy: false,
        scale: 1,

        caminhos: {
            lista: [],
            i: -1, // index de qual caminho
            caminho_i: 0 // etapa dentro do caminho
        },

        extras: {}
    };
    return s;
}

function _executa_processa()
{
    _processa();
    _executa_desenho();
}

function _executa_animacao()
{
    _animacao();
    
    _animacao_counter++;

    for (var i = 0; i < _lista_animacoes.length; i++)
    {
        var anim = _lista_animacoes[i];

        var t = anim.etapa / (anim.etapas-1);

        anim.sprite.alpha = anim.alpha.start*(1-t) + anim.alpha.end*(t);
        anim.sprite.scale = anim.scale.start*(1-t) + anim.scale.end*(t);
        anim.sprite.rot = anim.rot.start*(1-t) + anim.rot.end*(t);
        anim.sprite.offsetx = anim.offsetx.start*(1-t) + anim.offsetx.end*(t);
        anim.sprite.offsety = anim.offsety.start*(1-t) + anim.offsety.end*(t);

        anim.etapa++;
        if (anim.etapa >= anim.etapas)
        {
            _lista_animacoes.splice(i,1);
            i--;

            if (anim.on_end != undefined)
                anim.on_end();
        }
    }

    _executa_desenho();
}

function _executa_desenho()
{
    if (_camera.seguindo_sprite != null)
    {
        var m = _get_mapa(0);

        var s = _camera.seguindo_sprite;

        _camera.ox = parseInt(s.x / _camera.tiles_x) * _camera.tiles_x;
        _camera.oy = parseInt(s.y / _camera.tiles_y) * _camera.tiles_y;

        /*
        _camera.ox = Math.max(0, s.x - parseInt(_camera.tiles_x/2) );
        _camera.oy = Math.max(0, s.y - parseInt(_camera.tiles_y/2) );

        var ax = (_camera.ox + _camera.tiles_x) - m.w;
        var ay = (_camera.oy + _camera.tiles_y) - m.h;
        if (ax > 0) _camera.ox = Math.max(0, _camera.ox - ax);
        if (ay > 0) _camera.oy = Math.max(0, _camera.oy - ay);
        */
    }

    desenha_mapa();
}


function _get_mapa()
{
    if (mapas.length == 0)
    {
        alert("Erro no carregamento inicial do mapa");
        return null;
    }
    else
        return mapas[0];
}

function animacao_freq(x)
{
    // x = 1: todo quadro dá true.
    // x = 2: um quatro dá true, outro dá false.
    // x = 3: um quadro dá true, outros dois dão false.
    // etc.
    return _animacao_counter % x == 0;
}




//
// 3 - desenho
//
//
/////////////////////////////////////////////////////////////////


function _desenha_camada(m, i)
{
    var start_tx = _camera.ox;
    var start_ty = _camera.oy;
    var end_tx = Math.min(m.w-1, start_tx + _camera.tiles_x);
    var end_ty = Math.min(m.h-1, start_ty + _camera.tiles_y);

    for (var ty = start_ty; ty <= end_ty; ty++)
    {
        for (var tx = start_tx; tx <= end_tx; tx++)
        {
            var k = ty*m.w + tx;
            var gid = m.camadas[i].grid[k];
            
            if (gid == -1) continue;            

            var ts = m.tilesets[ m.tile_infos[gid].tileset ];
            if (ts.img == null) ts.img = imgs_by_arq[ ts.arq ];

            gid = m.tile_infos[gid].index_in_tileset;

            var px = (tx - start_tx)*m.tw;
            var py = (ty - start_ty)*m.th;

            var srcx = (gid * m.tw) % ts.img.width;
            var srcy = Math.floor( (gid * m.tw) / ts.img.width ) * m.th;

            cv.drawImage( ts.img, srcx,srcy,m.tw,m.th, px,py,m.tw,m.th );
            
            if (_modo_debug && i == 0)
            {
                var screen_tx = tx - start_tx;
                var screen_ty = ty - start_ty;
                
                if (m.tile_infos[gid].tipo == "solido")
                    desenha_quad( screen_tx, screen_ty, 1,1, "#800000", 0.3 );
                else if (m.tile_infos[gid].tipo == "buraco")
                    desenha_quad( screen_tx, screen_ty, 1,1, "#ff0000", 0.3 );                
            }
        }
    }
    
    if (_modo_debug)
    {
        var screen_tx = _debug_coord.x;
        var screen_ty = _debug_coord.y;
        
        var tx = screen_tx + _camera.ox;
        var ty = screen_ty + _camera.oy;
        
        var gid = m.camadas[0].grid[ ty*m.w + tx ];
        if (gid == -1) return;

        var ts = m.tilesets[ m.tile_infos[gid].tileset ];
        gid = m.tile_infos[gid].index_in_tileset;

        desenha_quad( screen_tx, screen_ty, 1,1, "#ffff00", 0.5 );
        desenha_texto_no_tile( tx, ty,
            "Tile [x:" + tx + ", y:" + ty + "] = " + gid, _debug_fonte );
    }
}

function desenha_mapa()
{
    var m = _get_mapa();

    _desenha_camada(m, 0);

    for (var i = 0; i < m.sprites.length; i++)
        if (m.sprites[i].aparece && !m.sprites[i].desenha_acima_dos_outros )
            desenha_sprite( m.sprites[i] );

    for (var i = 1; i < m.camadas.length; i++)
        _desenha_camada(m, i);

    for (var i = 0; i < m.sprites.length; i++)
        if (m.sprites[i].aparece && m.sprites[i].desenha_acima_dos_outros )
            desenha_sprite( m.sprites[i] );
}


function desenha_sprite(s)
{
    var m = _get_mapa();

    // fora do mapa?
    if (s.x < 0 || s.y < 0 || s.x >= m.w || s.y >= m.h) return;

    // fora da tela?
    if (s.x < _camera.ox || s.y < _camera.oy ||
        s.x >= _camera.ox + _camera.tiles_x ||
        s.y >= _camera.oy + _camera.tiles_y )
            return;

    var img_obj = imgs_by_arq[s.arq];
    if (img_obj == undefined)
    {
        alert("Sprite [" + s.nome + "] com imagem inválida: " + s.arq);
        return;
    }

    var px = (s.x - _camera.ox) * m.tw;
    var py = (s.y - _camera.oy) * m.th;
    var pw = m.tw;
    var ph = m.th;

    var srcx = (s.im * m.tw) % img_obj.width;
    var srcy = Math.floor( (s.im * m.tw) / img_obj.width ) * m.th;



    if (s.flipx || s.flipy)
    {
        cv.save();

        if (s.flipx) { cv.scale(-1,1); px = -px-pw; }
        if (s.flipy) { cv.scale(1,-1); py = -py-ph; }
    }

    cv.globalAlpha = s.alpha;    

    if (s.scale == 1)
        cv.drawImage( img_obj, srcx,srcy,pw,ph,  px,py,pw,ph );
    else
    {
        var ax = (pw*s.scale - pw) / 2;
        var ay = (ph*s.scale - ph) / 2;
        cv.drawImage( img_obj, srcx,srcy,pw,ph,  px-ax, py-ay, pw*s.scale, ph*s.scale );
    }
    
    cv.globalAlpha = 1;
    if (s.flipx || s.flipy) cv.restore();    


    
    if (_modo_debug)
    {
        desenha_texto_no_tile( s.x,s.y,
            s.nome + " [im:" + s.im + "]", "black", 1, _debug_fonte);
    }
}


function desenha_quad(x,y, w,h, cor, alpha, somente_borda, borda_width)
{
    // o (x,y) aqui é em coordenadas de TILES NA TELA
    
    var m = mapas[0];
    var px = x * m.tw;
    var py = y * m.th;
    var pw = w * m.tw;
    var ph = h * m.th;

    if (alpha == undefined) alpha = 1;
    if (somente_borda == undefined) somente_borda = false;
    if (borda_width == undefined) borda_width = 1;

    cv.globalAlpha = alpha;

    if (somente_borda)
    {
        cv.lineWidth = borda_width;

        cv.strokeStyle = cor;
        cv.strokeRect( px,py, pw,ph );
        
        cv.lineWidth = 1;        
    }
    else
    {
        cv.fillStyle = cor;
        cv.fillRect( px,py, pw,ph );        
    }
    
    cv.globalAlpha = 1;
}


function desenha_texto_no_pixel(px,py, texto, cor, alpha, fonte)
{
    if (alpha == undefined) alpha = 1;

    if (fonte != undefined) cv.font = fonte;

    cv.globalAlpha = alpha;
    
    cv.fillStyle = cor;
    cv.fillText( texto, px,py );

    cv.globalAlpha = 1;
}

function desenha_texto_no_tile(tx,ty, texto, cor, alpha, fonte)
{
    var m = _get_mapa();
    var px = (tx - _camera.ox)*m.tw;
    var py = (ty - _camera.oy)*m.th;
    
    desenha_texto_no_pixel( px,py, texto, cor, alpha, fonte );
}




//
// 4 - estruturas: mapas, tiles e sprites
//
//
/////////////////////////////////////////////////////////////////


function mapa_get_tile(tx, ty)
{
    var m = _get_mapa();

    tx = parseInt( tx );
    ty = parseInt( ty );

    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return -1;

    var k = ty*m.w + tx;
    return m.camadas[0].grid[k];
}

function mapa_set_tile(tx, ty, img)
{
    var m = _get_mapa();

    tx = parseInt( tx );
    ty = parseInt( ty );

    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return;

    var k = ty*m.w + tx;
    m.camadas[0].grid[k] = img;
}

function mapa_config_tiles(tipo, imgs)
{
    var m = _get_mapa();

    if (imgs == null)
    {
        for (var i = 0; i < m.tile_infos.length; i++)
        {
            var ti = m.tile_infos[i];
            if (ti.tipo == null)
                ti.tipo = tipo;
        }
    }
    else
    {
        for (var i = 0; i < imgs.length; i++)
            m.tile_infos[ imgs[i] ].tipo = tipo;
    }
}


function tile_dentro_da_lista(img, lista)
{
    return lista.indexOf(img) != -1;
}

function tile_fora_da_lista(img, lista)
{
    return lista.indexOf(img) == -1;
}


function mapa_tem_sprite(nome)
{
    var m = _get_mapa();
    for (var i = 0; i < m.sprites.length; i++)
        if (m.sprites[i].nome == nome)
            return true;

    return false;
}

function sprite_do_mapa(nome)
{
    var resp = null;
    var n = 0;

    var m = _get_mapa();
    for (var i = 0; i < m.sprites.length; i++)
        if (m.sprites[i].nome == nome)
        {
            resp = m.sprites[i];
            n++;
        }

    if (n == 0)
    {
        alert("Erro: sprite não existe: " + nome);
        return null;
    }
    else if (n >= 2)
    {
        alert("Erro: há vários sprites com o nome: " + nome);
        return resp;
    }
    else
        return resp;
}


function sprites_do_mapa(nome)
{
    var m = _get_mapa();
    var resp = [];

    for (var i = 0; i < m.sprites.length; i++)
        if (m.sprites[i].nome == nome)
            resp.push( m.sprites[i] );

    return resp;
}

function sprite_desaparece(s)
{
    s.aparece = false;
    s.x = -100;
    s.y = -100;
}

function sprite_get_tela_pos(s)
{
    var m = _get_mapa(0);
    return { x: (s.x - _camera.ox)*m.tw, y:(s.y - _camera.oy)*m.th };
}

function procura_sprite_na_lista(slista, desc)
{
    var s_nome = null;
    var s_im = null;

    var termos = desc.split(",");
    for (var i = 0; i < termos.length; i++)
    {
        var fields = termos[i].split("=");
        
        if (fields[0] == "nome")
            s_nome = fields[1];
        else if (fields[0] == "im")
            s_im = parseInt( fields[1] );
        else
        {
            alert("Erro: critério de busca de sprite inválido: " + desc);
            return null;
        }
    }
    
    for (var i = 0; i < slista.length; i++)
    {
        if (s_nome != null && slista[i].nome != s_nome) continue;
        if (s_im != null && slista[i].im != s_im) continue;

        return slista[i];
    }
    
    return null;
}







//
// 5 - movimento e colisao dos sprites
//
//
/////////////////////////////////////////////////////////////////


function mesma_posicao(s1, s2)
{
    return s1.x == s2.x && s1.y == s2.y;
}

function alguem_da_lista_com_mesma_posicao(s1, lista)
{
    for (var i = 0; i < lista.length; i++)
        if (mesma_posicao(s1, lista[i])) return lista[i];
    return null;
}

function distancia_entre(s1, s2)
{
    return Math.sqrt( (s1.x - s2.x)*(s1.x - s2.x) + (s1.y - s2.y)*(s1.y - s2.y) );
}

function mais_proximo_da_lista(s1, lista)
{
    var min_dist = 1000000;
    var min_dist_i = -1;

    for (var i = 0; i < lista.length; i++)
    {
        var dist = distancia_entre( s1, lista[i] );
        if (dist < min_dist)
        {
            min_dist = dist;
            min_dist_i = i;
        }
    }

    return min_dist_i;
}

function perto(s1, s2, max_dist)
{
    var d = distancia_entre(s1, s2);
    return d <= max_dist;
}

function alguem_da_lista_perto(s1, lista, max_dist)
{
    var i = mais_proximo_da_lista(s1, lista);
    var d = distancia_entre(s1, lista[i]);
    return d <= max_dist;
}



function fora_do_mapa(s)
{
    var m = _get_mapa();
    return (s.x < 0 || s.x >= m.w || s.y < 0 || s.y >= m.h);
}

function deixa_dentro_do_mapa(s)
{
    var m = _get_mapa();

    if (s.x < 0) s.x = 0;
    if (s.x >= m.w) s.x = m.w-1;

    if (s.y < 0) s.y = 0;
    if (s.y >= m.h) s.y = m.h-1;
}


function sprite_em_tile(s, tipo)
{
    var m = _get_mapa();

    var tx = s.x;
    var ty = s.y;

    var img = mapa_get_tile( tx, ty );

    var tipo_tile;
    if (img == -1)
        tipo_tile = -1;
    else
        tipo_tile = m.tile_infos[img].tipo;

    if (tipo == undefined)
        return tipo_tile;
    else
        return tipo_tile == tipo;
}

function camera_segue(s)
{
    _camera.seguindo_sprite = s;
}



function volta_posicao_anterior(s)
{
    s.x -= s.last_dx;
    s.y -= s.last_dy;
}

function move_sprite(s, dx, dy)
{
    s.x += dx;
    s.y += dy;

    s.last_dx = dx;
    s.last_dy = dy;
}

function move_sprite_para(s, x, y)
{
    var dx = x - s.x;
    var dy = y - s.y;
    
    move_sprite( s, dx, dy );
}

function move_sprite_por_teclado(s)
{
    var passo = 1;

    var dx = 0;
    var dy = 0;

    if ( teclado.left )
        dx = -passo;
    else if ( teclado.right )
        dx = +passo;
    else if ( teclado.up )
        dy = -passo;
    else if ( teclado.down )
        dy = +passo;

    move_sprite(s, dx,dy);
}

function move_sprite_na_mesma_direcao(dest, src)
{
    move_sprite( dest, src.last_dx, src.last_dy );
}


function _traduz_comandos_movimento(cmd)
{
    // ex.: x-1, y+1, x+1, x=4

    var termos = cmd.split(",");
    var etapas = [];

    for (var i = 0; i < termos.length; i++)
    {
        var termo = termos[i].trim();
        var eixo = termo[0];
        var valor = parseInt( termo.slice(2) );

        var etapa = {dx:0, dy:0, relativo:true};

        if (termo[1] == '-')
            valor = -valor;
        else if (termo[1] == '=')
            etapa.relativo = false; 

        if (eixo == 'x')
            etapa.dx = valor;
        else if (eixo == 'y')
            etapa.dy = valor;
        else
        {
            alert("Erro: comando de movimento inválido: " + cmd);
            return [];
        }
        
        etapas.push( etapa );
    }

    return etapas;
}



// útil pra sockets...
function move_sprite_por_comando(s, cmd)
{
    var etapas = _traduz_comandos_movimento(cmd);
    for (var i = 0; i < etapas.length; i++)
    {
        if (etapas[i].relativo)
            move_sprite( s, etapas[i].dx, etapas[i].dy );
        else
            move_sprite_para( s, etapas[i].dx, etapas[i].dy );
    }
}



function define_caminho(nome, cmd)
{
    var k = -1;
    
    // permite redefinir um caminho existente com o mesmo nome
    for (var i = 0; i < _lista_caminhos.length; i++)
        if ( _lista_caminhos[i].nome == nome )
        {
            k = i;
            break;
        }
    
    if (k == -1)
    {
        var caminho = { nome:null, cmd: null, etapas: null };
        _lista_caminhos.push( caminho );
        k = _lista_caminhos.length-1;
    }
    
    _lista_caminhos[k].nome = nome;
    _lista_caminhos[k].cmd = cmd;
    _lista_caminhos[k].etapas = _traduz_comandos_movimento( cmd ); 
}

function _get_caminho(nome)
{
    for (var i = 0; i < _lista_caminhos.length; i++)
        if (_lista_caminhos[i].nome == nome)
            return _lista_caminhos[i];
    
    alert("Erro: tentando usar caminho que não existe: " + nome);
    return null;
}

function sprite_segue_caminho(s, nomes)
{
    for (var i = 0; i < nomes.length; i++)
        s.caminhos.lista.push( nomes[i] );

    // agora que já temos caminhos, pega o primeiro pra ser o atual
    if (s.caminhos.lista.length >= 1 && s.caminhos.i == -1)    
        s.caminhos.i = 0;
}

function sprites_seguem_caminho(slista, nomes)
{
    for (var i = 0; i < slista.length; i++)
        sprite_segue_caminho( slista[i], nomes );
}

function move_sprite_por_caminho(s)
{
    if (s.caminhos.i < 0 || s.caminhos.i >= s.caminhos.lista.length)
        return;
    
    var c = _get_caminho( s.caminhos.lista[ s.caminhos.i ] );
    if (c == null)
        return;
    
    var i = s.caminhos.caminho_i;
    if (i < 0 || i >= c.etapas.length)
        return;
    
    if (c.etapas[i].relativo)
        move_sprite( s, c.etapas[i].dx, c.etapas[i].dy );
    else
        move_sprite_para( s, c.etapas[i].dx, c.etapas[i].dy );

    s.caminhos.caminho_i++;
    if (s.caminhos.caminho_i >= c.etapas.length)
    {
        s.caminhos.caminho_i = 0;        
        // on_end()
    }
}

function sprite_troca_caminho(s)
{
    // passa pro próximo caminho disponível
    s.caminhos.i++;
    if (s.caminhos.i >= s.caminhos.lista.length)
        s.caminhos.i = 0;
    
    // no novo caminho, começa da etapa 0
    s.caminhos.caminho_i = 0;
}



function sprite_animacao(s, desc, etapas, end_func)
{
    // já tem igual? cancela
    for (var i = 0; i < _lista_animacoes.length; i++)
    {
        var anim = _lista_animacoes[i];
        if (anim.sprite == s && anim.desc == desc) return;
    }


    var anim = {
        sprite: s,
        desc: desc,

        etapa: 0,
        etapas: etapas,

        alpha: { start:1, end:1 },
        scale: { start:1, end:1 },
        rot: { start:0, end:0 },
        offsetx: { start:0, end:0 },
        offsety: { start:0, end:0 },

        on_end: end_func
    };

    var cmds = desc.split(",");
    for (var i = 0; i < cmds.length; i++)
    {
        var cmd = cmds[i].trim();
        var termos = cmd.split(" ");

        // ex.: alpha 1 -> 0.5, scale 1 -> 2, etc.

        if (termos[0] == "alpha" || termos[0] == "scale" || termos[0] == "rot" ||
            termos[0] == "offsetx" || termos[0] == "offsety")
        {
            anim[ termos[0] ].start = parseFloat( termos[1] );
            anim[ termos[0] ].end = parseFloat( termos[3] );
        }
        else
        {
            alert("Animação: comando inválido: " + desc);
            return;
        }
    }

    _lista_animacoes.push( anim );
}
