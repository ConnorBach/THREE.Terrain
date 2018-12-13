var webglExists = ( function () { try { var canvas = document.createElement( 'canvas' ); return !!window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ); } catch( e ) { return false; } } )(); // jscs:ignore

var settingsForReload;
var settings;
var toggleEditDir = false;

if (!webglExists) {
  alert('Your browser does not appear to support WebGL. You can try viewing this page anyway, but it may be slow and some things may not look as intended. Please try viewing on desktop Firefox or Chrome.');
}

if (/&?webgl=0\b/g.test(location.hash)) {
  webglExists = !confirm('Are you sure you want to disable WebGL on this page?');
  if (webglExists) {
    location.hash = '#';
  }
}

// Workaround: in Chrome, if a page is opened with window.open(),
// window.innerWidth and window.innerHeight will be zero.
if ( window.innerWidth === 0 ) {
  window.innerWidth = parent.innerWidth;
  window.innerHeight = parent.innerHeight;
}

var camera, scene, renderer, clock, player, terrainScene, decoScene, lastOptions, controls = {}, fpsCamera, skyDome, skyLight, sand, water; // jscs:ignore requireLineBreakAfterVariableAssignment
var INV_MAX_FPS = 1 / 100,
    frameDelta = 0,
    paused = true,
    mouseX = 0,
    mouseY = 0,
    useFPS = false;

var nightbutton =false;


function animate() {
  stats.begin();
  draw();

  frameDelta += clock.getDelta();
  while (frameDelta >= INV_MAX_FPS) {
    update(INV_MAX_FPS);
    frameDelta -= INV_MAX_FPS;
  }

  stats.end();
  if (!paused) {
    requestAnimationFrame(animate);

  }
}

function startAnimating() {
  if (paused) {
    paused = false;
    controls.freeze = false;
    clock.start();
    requestAnimationFrame(animate);
  }
}

function stopAnimating() {
  paused = true;
  controls.freeze = true;
  clock.stop();
}

function setup() {
  
  setupThreeJS();
  setupControls();
  setupWorld();
  watchFocus();
  setupDatGui();

  startAnimating();

}

function setupThreeJS() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x868293, 0.0007);

  renderer = webglExists ? new THREE.WebGLRenderer({ antialias: true }) : new THREE.CanvasRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('tabindex', -1);

  camera = new THREE.PerspectiveCamera(60, renderer.domElement.width / renderer.domElement.height, 1, 10000);
  scene.add(camera);
  camera.position.x = 449;
  camera.position.y = 311;
  camera.position.z = 376;
  camera.rotation.x = -52 * Math.PI / 180;
  camera.rotation.y = 35 * Math.PI / 180;
  camera.rotation.z = 37 * Math.PI / 180;

  clock = new THREE.Clock(false);
}

function setupControls() {
  fpsCamera = new THREE.PerspectiveCamera(60, renderer.domElement.width / renderer.domElement.height, 1, 10000);
  scene.add(fpsCamera);
  controls = new THREE.FirstPersonControls(fpsCamera, renderer.domElement);
  controls.freeze = true;
  controls.movementSpeed = 100;
  controls.lookSpeed = 0.075;
}

function setupWorld() {
  new THREE.TextureLoader().load('demo/img/sky1.jpg', function(t1) {
    t1.minFilter = THREE.LinearFilter; // Texture is not a power-of-two size; use smoother interpolation.
    skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(8192, 16, 16, 0, Math.PI*2, 0, Math.PI*0.5),
      new THREE.MeshBasicMaterial({map: t1, side: THREE.BackSide, fog: false})
    );
    skyDome.position.y = -99;
    scene.add(skyDome);
  });

  water = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(16384+1024, 16384+1024, 16, 16),
    new THREE.MeshLambertMaterial({color: 0x006ba0, transparent: true, opacity: 0.6})
  );
  water.position.y = -99;
  water.rotation.x = -0.5 * Math.PI;
  scene.add(water);

  skyLight = new THREE.DirectionalLight(0xe8bdb0, 1.5);
  skyLight.position.set(2950, 2625, -160); // Sun on the sky texture
  scene.add(skyLight);
  var light = new THREE.DirectionalLight(0xc3eaff, 0.75);
  light.position.set(-1, -0.5, -1);
  scene.add(light);
}

function setupDatGui() {
  var heightmapImage = new Image();
  heightmapImage.src = 'demo/img/heightmap.png';
  function Settings() {
    var that = this;
    var mat = new THREE.MeshBasicMaterial({color: 0x5566aa, wireframe: true});
    var gray = new THREE.MeshPhongMaterial({ color: 0x88aaaa, specular: 0x444455, shininess: 10 });
    var red = new THREE.MeshPhongMaterial({ color: 0xDB7093, specular: 0x444455, shininess: 10 });
    
    var tex = new THREE.TextureLoader().load( 'demo/img/3.jpg' );

    // immediately use the texture for material creation
    //var chris = new THREE.MeshBasicMaterial( { map: tex } );
    var chris = new THREE.MeshPhongMaterial({  specular: 0x006400, shininess: 0.01 ,map: tex});
    var blend;
    var elevationGraph = document.getElementById('elevation-graph'),
        slopeGraph = document.getElementById('slope-graph'),
        analyticsValues = document.getElementsByClassName('value');
    var loader = new THREE.TextureLoader();
    loader.load('demo/img/sand1.jpg', function(t1) {
      t1.wrapS = t1.wrapT = THREE.RepeatWrapping;
      sand = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(16384+1024, 16384+1024, 64, 64),
        new THREE.MeshLambertMaterial({map: t1})
      );
      sand.position.y = -101;
      sand.rotation.x = -0.5 * Math.PI;
      scene.add(sand);
      loader.load('demo/img/grass1.jpg', function(t2) {
        loader.load('demo/img/stone1.jpg', function(t3) {
          loader.load('demo/img/snow1.jpg', function(t4) {
            // t2.repeat.x = t2.repeat.y = 2;
            blend = THREE.Terrain.generateBlendedMaterial([
              {texture: t1},
              {texture: t2, levels: [-80, -35, 20, 50]},
              {texture: t3, levels: [20, 50, 60, 85]},
              {texture: t4, glsl: '1.0 - smoothstep(65.0 + smoothstep(-256.0, 256.0, vPosition.x) * 10.0, 80.0, vPosition.z)'},
              {texture: t3, glsl: 'slope > 0.7853981633974483 ? 0.2 : 1.0 - smoothstep(0.47123889803846897, 0.7853981633974483, slope) + 0.2'}, // between 27 and 45 degrees
            ]);
            that.Regenerate();
          });
        });
      });
    });
    this.easing = 'Linear';
    this.heightmap = 'PerlinDiamond';
    this.smoothing = 'None';
    this.maxHeight = 200;
    this.segments = webglExists ? 63 : 31;
    this.steps = 1;
    this.turbulent = false;
    this.size = 1024;
    this.sky = true;
    this.texture = webglExists ? 'Blended' : 'Wireframe';
    this.edgeDirection = 'Normal';
    this.edgeType = 'Box';
    this.edgeDistance = 256;
    this.edgeCurve = 'EaseInOut';
    this['width:length ratio'] = 1.0;
    this['Flight mode'] = useFPS;
    this['Light color'] = '#' + skyLight.color.getHexString();
    this['Light intensity'] = skyLight.intensity;
    //light
    this['Night'] = false;
    this.Light ='Day';


    this.spread = 60;
    this.scattering = 'PerlinAltitude';
    this.after = function(vertices, options) {
      if (that.edgeDirection !== 'Normal') {
        (that.edgeType === 'Box' ? THREE.Terrain.Edges : THREE.Terrain.RadialEdges)(
          vertices,
          options,
          that.edgeDirection === 'Up' ? true : false,
          that.edgeType === 'Box' ? that.edgeDistance : Math.min(options.xSize, options.ySize) * 0.5 - that.edgeDistance,
          THREE.Terrain[that.edgeCurve]
        );
      }
    };
    window.rebuild = this.Regenerate = function() {
      console.log('in regenerate');
      var s = parseInt(that.segments, 10),
          h = that.heightmap === 'heightmap.png',
          //checkCanvas = false;
          checkCanvas = that.heightmap instanceof HTMLCanvasElement;
      console.log('heightmap: ', h, that.heightmap, Object.prototype.toString.call(that.heightmap));
      console.log(THREE.Terrain[that.heightmap]);
      var o = {
        after: that.after,
        easing: THREE.Terrain[that.easing],
        heightmap: checkCanvas ? that.heightmap : (h ? heightmapImage : (that.heightmap === 'influences' ? customInfluences : THREE.Terrain[that.heightmap])),
        material: that.texture == 'Wireframe' ? mat : (that.texture == 'Blended' ? blend : (that.texture == 'Redscale' ? red : (that.texture == 'Grayscale' ? gray : blend))),
        maxHeight: that.maxHeight - 100,
        minHeight: -100,
        steps: that.steps,
        stretch: true,
        turbulent: that.turbulent,
        useBufferGeometry: false,
        xSize: that.size,
        ySize: Math.round(that.size * that['width:length ratio']),
        xSegments: s,
        ySegments: Math.round(s * that['width:length ratio']),
        _mesh: typeof terrainScene === 'undefined' ? null : terrainScene.children[0], // internal only
      };
      console.log(o);
      scene.remove(terrainScene);
      terrainScene = THREE.Terrain(o);
      applySmoothing(that.smoothing, o);
      scene.add(terrainScene);
      skyDome.visible = sand.visible = water.visible = that.texture != 'Wireframe';
      var he = document.getElementById('heightmap');
      if (he) {
        o.heightmap = he;
        THREE.Terrain.toHeightmap(terrainScene.children[0].geometry.vertices, o);
      }
      that['Scatter meshes']();
      lastOptions = o;

      var analysis = THREE.Terrain.Analyze(terrainScene.children[0], o),
          deviations = getSummary(analysis),
          prop;
      analysis.elevation.drawHistogram(elevationGraph, 10);
      analysis.slope.drawHistogram(slopeGraph, 10);
      for (var i = 0, l = analyticsValues.length; i < l; i++) {
        prop = analyticsValues[i].getAttribute('data-property').split('.');
        var analytic = analysis[prop[0]][prop[1]];
        if (analyticsValues[i].getAttribute('class').split(/\s+/).indexOf('percent') !== -1) {
          analytic *= 100;
        }
        analyticsValues[i].textContent = cleanAnalytic(analytic);
      }
      for (prop in deviations) {
        if (deviations.hasOwnProperty(prop)) {
          document.querySelector('.summary-value[data-property="' + prop + '"]').textContent = deviations[prop];
        }
      }
    };
    function altitudeProbability(z) {
      if (z > -80 && z < -50) return THREE.Terrain.EaseInOut((z + 80) / (-50 + 80)) * that.spread * 0.002;
      else if (z > -50 && z < 20) return that.spread * 0.002;
      else if (z > 20 && z < 50) return THREE.Terrain.EaseInOut((z - 20) / (50 - 20)) * that.spread * 0.002;
      return 0;
    }
    this.altitudeSpread = function(v, k) {
      return k % 4 === 0 && Math.random() < altitudeProbability(v.z);
    };
    var mesh = buildTree();
    var decoMat = mesh.material.map(
      function(mat) {
        return mat.clone();
      }); // new THREE.MeshBasicMaterial({color: 0x229966, wireframe: true});
    decoMat[0].wireframe = true;
    decoMat[1].wireframe = true;
    this['Scatter meshes'] = function() {
      var s = parseInt(that.segments, 10),
          spread,
          randomness;
      var o = {
        xSegments: s,
        ySegments: Math.round(s * that['width:length ratio']),
      };
      if (that.scattering === 'Linear') {
        spread = that.spread * 0.0005;
        randomness = Math.random;
      }
      else if (that.scattering === 'Altitude') {
        spread = that.altitudeSpread;
      }
      else if (that.scattering === 'PerlinAltitude') {
        spread = (function() {
          var h = THREE.Terrain.ScatterHelper(THREE.Terrain.Perlin, o, 2, 0.125)(),
              hs = THREE.Terrain.InEaseOut(that.spread * 0.01);
          return function(v, k) {
            var rv = h[k],
                place = false;
            if (rv < hs) {
              place = true;
            }
            else if (rv < hs + 0.2) {
              place = THREE.Terrain.EaseInOut((rv - hs) * 5) * hs < Math.random();
            }
            return Math.random() < altitudeProbability(v.z) * 5 && place;
          };
        })();
      }
      else {
        spread = THREE.Terrain.InEaseOut(that.spread*0.01) * (that.scattering === 'Worley' ? 1 : 0.5);
        randomness = THREE.Terrain.ScatterHelper(THREE.Terrain[that.scattering], o, 2, 0.125);
      }
      var geo = terrainScene.children[0].geometry;
      terrainScene.remove(decoScene);
      decoScene = THREE.Terrain.ScatterMeshes(geo, {
        mesh: mesh,
        w: s,
        h: Math.round(s * that['width:length ratio']),
        spread: spread,
        smoothSpread: that.scattering === 'Linear' ? 0 : 0.2,
        randomness: randomness,
        maxSlope: 0.6283185307179586, // 36deg or 36 / 180 * Math.PI, about the angle of repose of earth
        maxTilt: 0.15707963267948966, //  9deg or  9 / 180 * Math.PI. Trees grow up regardless of slope but we can allow a small variation
      });
      if (decoScene) {
        if (that.texture == 'Wireframe') {
          decoScene.children[0].material = decoMat;
        }
        else if (that.texture == 'Grayscale') {
          decoScene.children[0].material = gray;
        }
        else if (that.texture == 'Redscale') {
          decoScene.children[0].material = red;
        }
        else if (that.texture == 'Chrismas') {
          decoScene.children[0].material = chris;
        }

        else if (that.Light == 'Night') {
          skyLight.color.set(0x000000);
         
        }
        else if (that.Light == 'Day') {
          skyLight.color.set(0xffffff);
          
        }
        terrainScene.add(decoScene);
      }
    };
  }
  var gui = new dat.GUI();
  //var settings = new Settings();
  settings = new Settings();
  settingsForReload = settings;
  var heightmapFolder = gui.addFolder('Heightmap');
  heightmapFolder.add(settings, 'heightmap', ['Brownian', 'Cosine', 'CosineLayers', 'DiamondSquare', 'Fault', 'heightmap.png', 'Hill', 'HillIsland', 'influences', 'Particles', 'Perlin', 'PerlinDiamond', 'PerlinLayers', 'Simplex', 'SimplexLayers', 'Value', 'Weierstrass', 'Worley']).onFinishChange(settings.Regenerate);
  heightmapFolder.add(settings, 'easing', ['Linear', 'EaseIn', 'EaseInWeak', 'EaseOut', 'EaseInOut', 'InEaseOut']).onFinishChange(settings.Regenerate);
  heightmapFolder.add(settings, 'smoothing', ['Conservative (0.5)', 'Conservative (1)', 'Conservative (10)', 'Gaussian (0.5, 7)', 'Gaussian (1.0, 7)', 'Gaussian (1.5, 7)', 'Gaussian (1.0, 5)', 'Gaussian (1.0, 11)', 'GaussianBox', 'Mean (0)', 'Mean (1)', 'Mean (8)', 'Median', 'None']).onChange(function (val) {
    applySmoothing(val, lastOptions);
    settings['Scatter meshes']();
    if (lastOptions.heightmap) {
      THREE.Terrain.toHeightmap(terrainScene.children[0].geometry.vertices, lastOptions);
    }
  });
  heightmapFolder.add(settings, 'segments', 7, 127).step(1).onFinishChange(settings.Regenerate);
  heightmapFolder.add(settings, 'steps', 1, 8).step(1).onFinishChange(settings.Regenerate);
  heightmapFolder.add(settings, 'turbulent').onFinishChange(settings.Regenerate);
  heightmapFolder.open();
  var decoFolder = gui.addFolder('Decoration');
  decoFolder.add(settings, 'texture', ['Blended', 'Grayscale', 'Redscale','Chrismas','Wireframe']).onFinishChange(settings.Regenerate);
  decoFolder.add(settings, 'scattering', ['Altitude', 'Linear', 'Cosine', 'CosineLayers', 'DiamondSquare', 'Particles', 'Perlin', 'PerlinAltitude', 'Simplex', 'Value', 'Weierstrass', 'Worley']).onFinishChange(settings['Scatter meshes']);
  decoFolder.add(settings, 'spread', 0, 100).step(1).onFinishChange(settings['Scatter meshes']);

  //decoFolder.addColor(settings, 'Light color').onChange(function(val) {
   // skyLight.color.set(val);
  //});

//lighting folder ***********
  var lightfolder = gui.addFolder('Light');
  lightfolder.addColor(settings, 'Light color').onChange(function(val) {
    skyLight.color.set(val);
  })
  
  lightfolder.add(settings, 'Light intensity', 0, 5).step(0.1).onChange(function(val) {
    //skyLight.intensity.set(val);
    skyLight.intensity = val;
     })
   lightfolder.add(settings, 'Light', ['Day','Night']).onFinishChange(settings.Regenerate);
  



  //********

  var sizeFolder = gui.addFolder('Size');
  sizeFolder.add(settings, 'size', 1024, 3072).step(256).onFinishChange(settings.Regenerate);
  sizeFolder.add(settings, 'maxHeight', 2, 300).step(2).onFinishChange(settings.Regenerate);
  sizeFolder.add(settings, 'width:length ratio', 0.2, 2).step(0.05).onFinishChange(settings.Regenerate);
  var edgesFolder = gui.addFolder('Edges');
  edgesFolder.add(settings, 'edgeType', ['Box', 'Radial']).onFinishChange(settings.Regenerate);
  edgesFolder.add(settings, 'edgeDirection', ['Normal', 'Up', 'Down']).onFinishChange(settings.Regenerate);
  edgesFolder.add(settings, 'edgeCurve', ['Linear', 'EaseIn', 'EaseOut', 'EaseInOut']).onFinishChange(settings.Regenerate);
  edgesFolder.add(settings, 'edgeDistance', 0, 512).step(32).onFinishChange(settings.Regenerate);
  gui.add(settings, 'Flight mode').onChange(function(val) {
    useFPS = val;
    fpsCamera.position.x = 449;
    fpsCamera.position.y = 311;
    fpsCamera.position.z = 376;
    controls.lat = -41;
    controls.lon = -139;
    controls.update(0);
    controls.freeze = true;
    if (useFPS) {
      document.getElementById('fpscontrols').className = 'visible';
      setTimeout(function() {
        controls.freeze = false;
      }, 1000);
    }
    else {
      document.getElementById('fpscontrols').className = '';
    }
  });

  gui.add(settings, 'Scatter meshes');
  gui.add(settings, 'Regenerate');

  if (typeof window.Stats !== 'undefined' && /[?&]stats=1\b/g.test(location.search)) {
    stats = new Stats();
    stats.setMode(0);
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.left = '20px';
    stats.domElement.style.bottom = '0px';
    document.body.appendChild(stats.domElement);
    document.getElementById('code').style.left = '120px';
  }
  else {
    stats = {begin: function() {}, end: function() {}};
  }
}

window.addEventListener('resize', function() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = renderer.domElement.width / renderer.domElement.height;
  camera.updateProjectionMatrix();
  fpsCamera.aspect = renderer.domElement.width / renderer.domElement.height;
  fpsCamera.updateProjectionMatrix();
  draw();
}, false);

function draw() {
  renderer.render(scene, useFPS ? fpsCamera : camera);
}

function update(delta) {
  if (terrainScene) terrainScene.rotation.z = Date.now() * 0.00001;
  if (controls.update) controls.update(delta);
}

document.addEventListener('mousemove', function(event) {
  if (!paused) {
    mouseX = event.pageX;
    mouseY = event.pageY;
  }
}, false);

// Stop animating if the window is out of focus
function watchFocus() {
  var _blurred = false;
  window.addEventListener('focus', function() {
    if (_blurred) {
      _blurred = false;
      // startAnimating();
      // controls.freeze = false;
    }
  });
  window.addEventListener('blur', function() {
    // stopAnimating();
    _blurred = true;
    controls.freeze = true;
  });
}

document.querySelector('#analytics .close').addEventListener('click', function(event) {
  event.preventDefault();
  document.getElementById('analytics').classList.remove('visible');
  document.getElementById('show-analytics').classList.add('visible');
}, false);

document.querySelector('#show-analytics').addEventListener('click', function(event) {
  event.preventDefault();
  document.getElementById('show-analytics').classList.remove('visible');
  var analytics = document.getElementById('analytics');
  analytics.scrollTop = 0;
  analytics.classList.add('visible');
}, false);

/* Project Changes */
//console.log('settings: ', settings);
document.querySelector('#heightmap').addEventListener('click', function (event) {
  //event.preventDefault();
  var mouses = { x : 0, y : 0 };
  //mouses.x = ( ( event.clientX - renderer.domElement.offsetLeft ) / window.innerWidth ) * 2 - 1;
  //mouses.y = - ( ( event.clientY - renderer.domElement.offsetTop ) / window.innerHeight ) * 2 + 1;

  // height map is (22, 22) top left to (149, 149) bottom right
  mouses.x = ((event.clientX - 22) / (149-22)) * 64;
  mouses.y = ((event.clientY - 22) / (149-22)) * 64;
  console.log("mouse clicked", mouses);

  console.log("terrainScene", terrainScene);
  console.log("terrainScene.children[0].geometry.vertices", terrainScene.children[0].geometry.vertices);

  var testCanvas = toHeightmap2(terrainScene.children[0].geometry.vertices, 
    { xSegments: 63, ySegments: 63 });
  console.log('testCanvas: ', testCanvas);

  var ctx = testCanvas.getContext("2d");
  var imageData = ctx.getImageData(0, 0, 64, 64);
  console.log('imageData: ', imageData);
  var startX = Math.floor(mouses.x);
  var startY = Math.floor(mouses.y);

  console.log('startX, startY', startX, startY);

  for(var i = 0; i < 64; i++) {
    for(var j = 0; j < 64; j++) {
      var a = i - startX;
      var b = j - startY;
      if(a*a + b*b <= 10*10) {
        var pos = 4*(i + j*64);
        if(toggleEditDir) {
          imageData.data[pos] += 40;
          imageData.data[pos+1] += 40;
          imageData.data[pos+2] += 40;
        } else {
          imageData.data[pos] -= 40;
          imageData.data[pos+1] -= 40;
          imageData.data[pos+2] -= 40;
        }
        imageData.data[pos+3] = 255;
      }
    }
  }

  console.log('imageData2: ', imageData);
  ctx.putImageData(imageData, 0, 0);

  console.log("here");
  console.log(settings);
  settings.heightmap = testCanvas;
  settings.Regenerate();
});

document.onkeypress = function (e) {
  e = e || window.event;
  // use e.keyCode
  console.log("keypress");
  if(e.key == "ArrowDown") {
    toggleEditDir = false;
  } else if( e.key == "ArrowUp") {
    toggleEditDir = true;
  }
  console.log(toggleEditDir);
};

function __printCameraData() {
  var s = '';
  s += 'camera.position.x = ' + Math.round(fpsCamera.position.x) + ';\n';
  s += 'camera.position.y = ' + Math.round(fpsCamera.position.y) + ';\n';
  s += 'camera.position.z = ' + Math.round(fpsCamera.position.z) + ';\n';
  s += 'camera.rotation.x = ' + Math.round(fpsCamera.rotation.x * 180 / Math.PI) + ' * Math.PI / 180;\n';
  s += 'camera.rotation.y = ' + Math.round(fpsCamera.rotation.y * 180 / Math.PI) + ' * Math.PI / 180;\n';
  s += 'camera.rotation.z = ' + Math.round(fpsCamera.rotation.z * 180 / Math.PI) + ' * Math.PI / 180;\n';
  s += 'controls.lat = ' + Math.round(controls.lat) + ';\n';
  s += 'controls.lon = ' + Math.round(controls.lon) + ';\n';
  console.log(s);
}

function applySmoothing(smoothing, o) {
  var m = terrainScene.children[0];
  var g = m.geometry.vertices;
  if (smoothing === 'Conservative (0.5)') THREE.Terrain.SmoothConservative(g, o, 0.5);
  if (smoothing === 'Conservative (1)') THREE.Terrain.SmoothConservative(g, o, 1);
  if (smoothing === 'Conservative (10)') THREE.Terrain.SmoothConservative(g, o, 10);
  else if (smoothing === 'Gaussian (0.5, 7)') THREE.Terrain.Gaussian(g, o, 0.5, 7);
  else if (smoothing === 'Gaussian (1.0, 7)') THREE.Terrain.Gaussian(g, o, 1, 7);
  else if (smoothing === 'Gaussian (1.5, 7)') THREE.Terrain.Gaussian(g, o, 1.5, 7);
  else if (smoothing === 'Gaussian (1.0, 5)') THREE.Terrain.Gaussian(g, o, 1, 5);
  else if (smoothing === 'Gaussian (1.0, 11)') THREE.Terrain.Gaussian(g, o, 1, 11);
  else if (smoothing === 'GaussianBox') THREE.Terrain.GaussianBoxBlur(g, o, 1, 3);
  else if (smoothing === 'Mean (0)') THREE.Terrain.Smooth(g, o, 0);
  else if (smoothing === 'Mean (1)') THREE.Terrain.Smooth(g, o, 1);
  else if (smoothing === 'Mean (8)') THREE.Terrain.Smooth(g, o, 8);
  else if (smoothing === 'Median') THREE.Terrain.SmoothMedian(g, o);
  THREE.Terrain.Normalize(m, o);
}

function buildTree() {
  var material = [
    new THREE.MeshLambertMaterial({ color: 0x3d2817 }), // brown
    new THREE.MeshLambertMaterial({ color: 0x2d4c1e }), // green
    

  ];

  var c0 = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 12, 6, 1, true));
  c0.position.y = 6;
  var c1 = new THREE.Mesh(new THREE.CylinderGeometry(0, 10, 14, 8));
  c1.position.y = 18;
  var c2 = new THREE.Mesh(new THREE.CylinderGeometry(0, 9, 13, 8));
  c2.position.y = 25;
  var c3 = new THREE.Mesh(new THREE.CylinderGeometry(0, 8, 12, 8));
  c3.position.y = 32;

  var g = new THREE.Geometry();
  c0.updateMatrix();
  c1.updateMatrix();
  c2.updateMatrix();
  c3.updateMatrix();
  g.merge(c0.geometry, c0.matrix);
  g.merge(c1.geometry, c1.matrix);
  g.merge(c2.geometry, c2.matrix);
  g.merge(c3.geometry, c3.matrix);

  var b = c0.geometry.faces.length;
  for (var i = 0, l = g.faces.length; i < l; i++) {
    g.faces[i].materialIndex = i < b ? 0 : 1;
  }

  var m = new THREE.Mesh(g, material);

  m.scale.x = m.scale.z = 5;
  m.scale.y = 1.25;
  return m;
}

function customInfluences(g, options) {
  var clonedOptions = {};
  for (var opt in options) {
      if (options.hasOwnProperty(opt)) {
          clonedOptions[opt] = options[opt];
      }
  }
  clonedOptions.maxHeight = options.maxHeight * 0.67;
  clonedOptions.minHeight = options.minHeight * 0.67;
  THREE.Terrain.DiamondSquare(g, clonedOptions);

  var radius = Math.min(options.xSize, options.ySize) * 0.21,
      height = options.maxHeight * 0.8;
  THREE.Terrain.Influence(
    g, options,
    THREE.Terrain.Influences.Hill,
    0.25, 0.25,
    radius, height,
    THREE.AdditiveBlending,
    THREE.Terrain.Linear
  );
  THREE.Terrain.Influence(
    g, options,
    THREE.Terrain.Influences.Mesa,
    0.75, 0.75,
    radius, height,
    THREE.SubtractiveBlending,
    THREE.Terrain.EaseInStrong
  );
  THREE.Terrain.Influence(
    g, options,
    THREE.Terrain.Influences.Flat,
    0.75, 0.25,
    radius, options.maxHeight,
    THREE.NormalBlending,
    THREE.Terrain.EaseIn
  );
  THREE.Terrain.Influence(
    g, options,
    THREE.Terrain.Influences.Volcano,
    0.25, 0.75,
    radius, options.maxHeight,
    THREE.NormalBlending,
    THREE.Terrain.EaseInStrong
  );
}

function cleanAnalytic(val) {
  if (Array.isArray(val)) {
    if (val.length === 1) {
      val = val[0];
    }
    else {
      var str = val.map(function(v) { return Math.round(v); }).join(', ');
      if (str.length > 9) str = val.join(',');
      if (str.length > 9) str = str.substring(0, str.lastIndexOf(',', 7)) + ',&hellip;';
      return str;
    }
  }
  var valIntStr = (val | 0) + '',
      c = '';
  if ((val | 0) === 0 && val < 0) {
    valIntStr = '-' + valIntStr;
  }
  while (valIntStr.length + c.length < 5) {
    c += ' ';
  }
  return c + val.round(3);
}

var moments = {
    'elevation.stdev': {
        mean: 42.063,
        stdev: 6.353,
    },
    'elevation.pearsonSkew': {
        // mean: 0.100,
        // stdev: 0.566,
        levels: {
            '+high': -1.032,
            '+medium': -0.277,
            'low': 0.666,
            '-medium': 1.232,
            '-high': Infinity,
        },
    },
    'slope.stdev': {
        mean: 10.154,
        stdev: 3.586,
    },
    'slope.groeneveldMeedenSkew': {
        // mean: -0.021,
        // stdev: 0.163,
        levels: {
            '+high': -0.347,
            '+medium': -0.130,
            'low': 0.088,
            '-medium': 0.305,
            '-high': Infinity,
        },
    },
    'roughness.jaggedness': {
        levels: [0.006, 0.02, 0.044, 0.10],
    },
    'roughness.terrainRuggednessIndex': {
        levels: [1, 2.2, 3.5, 4.8],
    },
};

function getSummary(analytics) {
    var results = {},
        deviationBuckets = [-2, -2/3, 2/3, 2];
    for (var prop in moments) {
        if (moments.hasOwnProperty(prop)) {
            var averageProp = moments[prop],
                split = prop.split('.'),
                sampleProp = analytics[split[0]][split[1]];
            if (typeof averageProp.mean === 'number') {
                results[prop] = (sampleProp - averageProp.mean) / averageProp.stdev;
                results[prop] = numberToCategory(results[prop], deviationBuckets);
            }
            else {
                results[prop] = numberToCategory(sampleProp, averageProp.levels);
            }
        }
    }
    return results;
}

/**
 * Classify a numeric input.
 *
 * @param {Number} value
 *   The number to classify.
 * @param {Object/Number[]} [buckets=[-2, -2/3, 2/3, 2]]
 *   An object or numeric array used to classify `value`. If `buckets` is an
 *   array, the returned category will be the first of "very low," "low,"
 *   "medium," and "high," in that order, where the correspondingly ordered
 *   bucket value is higher than the `value` being classified, or "very high"
 *   if all bucket values are smaller than the `value` being classified. If
 *   `buckets` is an object, its values will be sorted, and the returned
 *   category will be the key of the first bucket value that is higher than the
 *   `value` being classified, or the key of the highest bucket value if the
 *   `value` being classified is higher than all the values in `buckets`.
 *
 * @return {String}
 *   The category into which the numeric input was classified.
 */
function numberToCategory(value, buckets) {
    if (!buckets) {
        buckets = [-2, -2/3, 2/3, 2];
    }
    if (typeof buckets.length === 'number' && buckets.length > 3) {
        if (value <  buckets[0]) return 'very low';
        if (value <  buckets[1]) return 'low';
        if (value <  buckets[2]) return 'medium';
        if (value <  buckets[3]) return 'high';
        if (value >= buckets[3]) return 'very high';
    }
    var keys = Object.keys(buckets).sort(function(a, b) {
            return buckets[a] - buckets[b];
        }),
        l = keys.length;
    for (var i = 0; i < l; i++) {
        if (value < buckets[keys[i]]) {
            return keys[i];
        }
    }
    return keys[l-1];
}

/**
 * Utility method to round numbers to a given number of decimal places.
 *
 * Usage:
 *   3.5.round(0) // 4
 *   Math.random().round(4) // 0.8179
 *   var a = 5532; a.round(-2) // 5500
 *   Number.prototype.round(12345.6, -1) // 12350
 *   32..round(-1) // 30 (two dots required since the first one is a decimal)
 */
Number.prototype.round = function(v, a) {
  if (typeof a === 'undefined') {
    a = v;
    v = this;
  }
  if (!a) a = 0;
  var m = Math.pow(10, a|0);
  return Math.round(v*m)/m;
};


/* Project Changes
document.querySelector('#heightmap').addEventListener('click', function (event) {
  //event.preventDefault();
  var mouses = { x : 0, y : 0 };
  //mouses.x = ( ( event.clientX - renderer.domElement.offsetLeft ) / window.innerWidth ) * 2 - 1;
  //mouses.y = - ( ( event.clientY - renderer.domElement.offsetTop ) / window.innerHeight ) * 2 + 1;

  // height map is (22, 22) top left to (149, 149) bottom right
  mouses.x = (event.clientX) / (149-22);
  mouses.y = event.clientY / (149-22);
  console.log("mouse clicked", mouses);

  var canvas = THREE.Terrain.toHeightmap(
    // terrainScene.children[0] is the most detailed version of the terrain mesh
    terrainScene.children[0].geometry.vertices,
    { xSegments: 63, ySegments: 63 }
  );

  console.log(canvas);

  var ctx = canvas.getContext('2d')
  ctx.beginPath();
  ctx.rect(64, 64, 64, 64);
  ctx.fillStyle = 'black';
  ctx.fill();

  // Generate a terrain
  var xS = 63, yS = 63;
  var temp = {
      easing: THREE.Terrain.Linear,
      frequency: 2.5,
      heightmap: THREE.Terrain.Cosine,
      material: new THREE.MeshBasicMaterial({color: 0x5566aa}),
      maxHeight: 100,
      minHeight: -100,
      steps: 1,
      useBufferGeometry: false,
      xSegments: xS,
      xSize: 1024,
      ySegments: yS,
      ySize: 1024,
  };
  // Assuming you already have your global scene, add the terrain to it
  scene.remove(terrainScene);
  terrainScene = THREE.Terrain(temp);
  //applySmoothing(that.smoothing, temp);
  scene.add(terrainScene);
  skyDome.visible = sand.visible = water.visible;
}); */

function getCanvasFromTerrain() {
  var canvas = THREE.Terrain.toHeightmap(
    // terrainScene.children[0] is the most detailed version of the terrain mesh
    terrainScene.children[0].geometry.vertices,
    { xSegments: 63, ySegments: 63 }
  );
  return canvas;
}

toHeightmap2 = function(g, options) {
    console.log('==== toheightmap =====');
    var hasMax = typeof options.maxHeight === 'undefined',
        hasMin = typeof options.minHeight === 'undefined',
        max = hasMax ? options.maxHeight : -Infinity,
        min = hasMin ? options.minHeight :  Infinity;
    if (!hasMax || !hasMin) {
        var max2 = max,
            min2 = min;
        for (var k = 0, l = g.length; k < l; k++) {
            if (g[k].z > max2) max2 = g[k].z;
            if (g[k].z < min2) min2 = g[k].z;
        }
        if (!hasMax) max = max2;
        if (!hasMin) min = min2;
    }
    var canvas = options.heightmap instanceof HTMLCanvasElement ? options.heightmap : document.createElement('canvas'),
        context = canvas.getContext('2d'),
        rows = options.ySegments + 1,
        cols = options.xSegments + 1,
        spread = options.maxHeight - options.minHeight;
    canvas.width = cols;
    canvas.height = rows;
    var d = context.createImageData(canvas.width, canvas.height),
        data = d.data;
    console.log("loop vals: ", g[0].z, options.minHeight, spread)
    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            //var i = row * cols + col,
            var i = row * canvas.width + col;
            idx = i * 4;
            data[idx] = data[idx+1] = data[idx+2] = Math.round(((g[i].z + 100) / 200) * 255);
            data[idx+3] = 255;
            //console.log("writing values", Math.round(((g[i].z) / 100) * 255));
            if(data[idx] != 0) {
                console.log('in toheightmap: non zero');
            }
        }
    }
    console.log("returning a canvas", data);
    context.putImageData(d, 0, 0);
    return canvas;
};