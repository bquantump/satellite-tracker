import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
//import earthmap from './assets/earthmap-high.jpg';
import earthmap from './assets/2_no_clouds_16k.jpg';
import circle from './assets/circle.png';
import { parseTleFile as parseTleFile, getPositionFromTle, latLon2Xyz2, latLon2Xyz } from "./tle";
import { earthRadius } from "satellite.js/lib/constants";


const SatelliteSize = 50;
const ixpdotp = 1440 / (2.0 * 3.141592654) ;

let TargetDate = new Date();

const defaultOptions = {
    backgroundColor: 0x333340,
    defaultSatelliteColor: 0xff0000,
    onStationClicked: null
}

const defaultStationOptions = {
    orbitMinutes: 0,
    satelliteSize: 50
}

export class Engine {

    stations = [];

    initialize(container, options = {}) {
        this.el = container;
        this.raycaster = new THREE.Raycaster();
        this.options = { ...defaultOptions, ...options };

        this._setupScene();
        this._setupLights();
        this._addBaseObjects();

        this.render();

        window.addEventListener('resize', this.handleWindowResize);
        window.addEventListener('pointerup', this.handleMouseDown);
    }

    dispose() {
        window.removeEventListener('pointerup', this.handleMouseDown);
        window.removeEventListener('resize', this.handleWindowResize);
        //window.cancelAnimationFrame(this.requestID);
        
        this.raycaster = null;
        this.el = null;

        this.controls.dispose();
    }

    handleWindowResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.render();
    };

    handleMouseDown = (e) => {
        const mouse = new THREE.Vector2(
            (e.clientX / window.innerWidth ) * 2 - 1,
            -(e.clientY / window.innerHeight ) * 2 + 1 );

	    this.raycaster.setFromCamera(mouse, this.camera);

        let station = null;

	    var intersects = this.raycaster.intersectObjects(this.scene.children, true);
        if (intersects && intersects.length > 0) {
            const picked = intersects[0].object;
            if (picked) {
                station = this._findStationFromMesh(picked);
            }
        }

        const cb = this.options.onStationClicked;
        if (cb) cb(station);
    }


    // __ API _________________________________________________________________


    addSatellite = (station, color, size) => {
        
        //const sat = this._getSatelliteMesh(color, size);
        const sat = this._getSatelliteSprite(color, size);
        const pos = this._getSatellitePositionFromTle(station);
        if (!pos) return;
        //const pos = { x: Math.random() * 20000 - 10000, y: Math.random() * 20000 - 10000 , z: Math.random() * 20000 - 10000, }

        sat.position.set(pos.x, pos.y, pos.z);
        station.mesh = sat;

        this.stations.push(station);

        if (station.orbitMinutes > 0) this.addOrbit(station);

        this.earth.add(sat);
    }

    loadLteFileStations = (url, color, stationOptions) => {
        const options = { ...defaultStationOptions, ...stationOptions };

        return fetch(url).then(res => {
            if (res.ok) {
                return res.text().then(text => {
                    return this._addTleFileStations(text, color, options);
                
                });
            }
        });
    }

    addOrbit = (station) => {
        if (station.orbitMinutes > 0) return;

        const revsPerDay = station.satrec.no * ixpdotp;
        const intervalMinutes = 1;
        const minutes = station.orbitMinutes || 1440 / revsPerDay;
        const initialDate = new Date();

        //console.log('revsPerDay', revsPerDay, 'minutes', minutes);

        if (!this.orbitMaterial) {
            this.orbitMaterial = new THREE.LineBasicMaterial({color: 0x999999, opacity: 1.0, transparent: true });
        }

        var points = [];
        
        for (var i = 0; i <= minutes; i += intervalMinutes) {
            const date = new Date(initialDate.getTime() + i * 60000);

            const pos = getPositionFromTle(station, date);
            if (!pos) continue;

            points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        var orbitCurve = new THREE.Line(geometry, this.orbitMaterial);
        
        //pyramid.rotation.x = Math.PI / 4;
        station.orbit = orbitCurve;
        station.mesh.material = this.selectedMaterial;
        this.earth.add(orbitCurve);
        this.render();
    }

    removeOrbit = (station) => {
        if (!station || !station.orbit) return;

        this.earth.remove(station.orbit);
        station.orbit.geometry.dispose();
        station.orbit = null;
        station.mesh.material = this.material;
        this.render();
    }

    highlightStation = (station) => {
        station.mesh.material = this.highlightedMaterial;
    }

    clearStationHighlight = (station) => {
        station.mesh.material = this.material;
    }

    _addTleFileStations = (lteFileContent, color, stationOptions) => {
        const stations = parseTleFile(lteFileContent, stationOptions);

        const { satelliteSize } = stationOptions;

        stations.forEach(s => {
            this.addSatellite(s, color, satelliteSize);
        });

        this.render();

        return stations;
    }



    _getSatelliteMesh = (color, size) => {
        color = color || this.options.defaultSatelliteColor;
        size = size || SatelliteSize;

        if (!this.geometry) {

            this.geometry = new THREE.BoxBufferGeometry(size, size, size);
            this.material = new THREE.MeshPhongMaterial({
                color: color,
                emissive: 0xFF4040,
                flatShading: false,
                side: THREE.DoubleSide,
            });
        }

        return new THREE.Mesh(this.geometry, this.material);
    }

    _setupSpriteMaterials = (color) => {
        if (this.material) return;
        
        this._satelliteSprite = new THREE.TextureLoader().load(circle, this.render);
        this.selectedMaterial = new THREE.SpriteMaterial({
            map: this._satelliteSprite, 
            color: 0xFF0000,
            sizeAttenuation: false
        });
        this.highlightedMaterial = new THREE.SpriteMaterial({
            map: this._satelliteSprite,
            color: 0xfca300,
            sizeAttenuation: false
        });            
        this.material = new THREE.SpriteMaterial({
            map: this._satelliteSprite, 
            color: color, 
            sizeAttenuation: false
        });            
    }

    _getSatelliteSprite = (color, size) => {
        const SpriteScaleFactor = 5000;

        this._setupSpriteMaterials(color);

        const result = new THREE.Sprite(this.material);
        result.scale.set(size / SpriteScaleFactor, size / SpriteScaleFactor, 1);
        return result;
    }

    _getSatellitePositionFromTle = (station, date) => {
        date = date || TargetDate;
        return getPositionFromTle(station, date);
    }

    updateSatellitePosition = (station, date) => {
        date = date || TargetDate;

        const pos = getPositionFromTle(station, date);
        if (!pos) return;

        station.mesh.position.set(pos.x, pos.y, pos.z);
    }

    
    updateAllPositions = (date) => {
        if (!this.stations) return;

        this.stations.forEach(station => {
            this.updateSatellitePosition(station, date);
        });

        this.render();
    }


    // __ Scene _______________________________________________________________


    _setupScene = () => {
        const width = this.el.clientWidth;
        const height = this.el.clientHeight;

        this.scene = new THREE.Scene();

        this._setupCamera(width, height);

        this.renderer = new THREE.WebGLRenderer({
            logarithmicDepthBuffer: true,
            antialias: true
        });

        this.renderer.setClearColor(new THREE.Color(this.options.backgroundColor));
        this.renderer.setSize(width, height);

        this.el.appendChild(this.renderer.domElement);
    };

    _setupCamera(width, height) {
        var NEAR = 1e-6, FAR = 1e27;
        this.camera = new THREE.PerspectiveCamera(54, width / height, NEAR, FAR);
        this.controls = new OrbitControls(this.camera, this.el);
        this.controls.enablePan = false;
        this.controls.addEventListener('change', () => this.render());
        this.camera.position.z = -15000;
        this.camera.position.x = 15000;
        this.camera.lookAt(0, 0, 0);
    }

    _setupLights = () => {
        const sun = new THREE.PointLight(0xffffff, 1, 0);
        //sun.position.set(0, 0, -149400000);
        sun.position.set(0, 49333894, 187112541);

        const ambient = new THREE.AmbientLight(0x909090);
        const spotLight = new THREE.SpotLight( 0xffffff );
        spotLight.position.set(-0.338293241933552 * 6880, 0.734195730436108 * 7055, 0.5886546626601008 * 7500);
        
        spotLight.castShadow = true;
        
        spotLight.shadow.mapSize.width = 1024;
        spotLight.shadow.mapSize.height = 1024;
        
        spotLight.shadow.camera.near = 500;
        spotLight.shadow.camera.far = 4000;
        spotLight.shadow.camera.fov = 30;
        //this.scene.add(sun);
        this.scene.add(spotLight)
        this.scene.add(ambient);
    }

    _addBaseObjects = () => {
        this._addEarth();
    };

    render = () => {
        this.renderer.render(this.scene, this.camera);
        //this.requestID = window.requestAnimationFrame(this._animationLoop); 
    };



    // __ Scene contents ______________________________________________________


    _addEarth = () => {
        const textLoader = new THREE.TextureLoader();

        const group = new THREE.Group();

        // Planet
        let geometry = new THREE.SphereGeometry(earthRadius, 50, 50);
        let material = new THREE.MeshPhongMaterial({
            //color: 0x156289,
            //emissive: 0x072534,
            side: THREE.DoubleSide,
            flatShading: false,
            map: textLoader.load(earthmap, this.render)
        });

        const earth = new THREE.Mesh(geometry, material);
        group.add(earth);

        // // Axis
        // material = new THREE.LineBasicMaterial({color: 0xffffff});
        // geometry = new THREE.Geometry();
        // geometry.vertices.push(
        //     new THREE.Vector3(0, -7000, 0),
        //     new THREE.Vector3(0, 7000, 0)
        // );
        
        // var earthRotationAxis = new THREE.Line(geometry, material);
        // group.add(earthRotationAxis);

        this.earth = group;
        this.scene.add(this.earth);
        
        const radius = 75;  

        const detail = 2;  
        //("rgb(192,192,192)"),
        const geometry2 = new THREE.OctahedronGeometry(radius, detail);
        var material2 = new THREE.MeshPhongMaterial({
            color      :  new THREE.Color("rgb(126,137,143)"),
            emissive   :  new THREE.Color("rgb(0,0,0)"),
            specular   :  new THREE.Color("rgb(200,155,255)"),
            shininess  :  1,
            shading    :  THREE.FlatShading,
            transparent: 1,
            opacity    : 1
          });
        //var material2 = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: false } );
        var cone = new THREE.Mesh(geometry2, material2);

        cone.position.x = -0.338293241933552 * 6378
        cone.position.y = 0.734195730436108 * 6378
        cone.position.z = 0.5886546626601008 * 6378

        var loader = new THREE.FontLoader();
        loader.load( 'helvetiker_bold.typeface.json', function ( font ) {
        
          var textGeometry = new THREE.TextGeometry( "WestUS Ground Station", {
        
            font: font,
        
            size: 25,
            height: 1,
            curveSegments: 10,
            bevelThickness: 1,
            bevelSize: 1,
            bevelEnabled: true
        
          });

          var textMaterial = new THREE.MeshPhongMaterial( 
            { color: 0xff0000, specular: 0xffffff }
          );
          textGeometry.center();
          //textGeometry.computeBoundingBox();
          //const center = textGeometry.boundingBox.getCenter(new THREE.Vector3());
          var txtMesh = new THREE.Mesh( textGeometry, textMaterial );
          //mesh.geometry.translate( 0.338293241933552 * 6378, 0.734195730436108 * 6378, 0.5886546626601008 * 6378)
          //mesh.position.x = 0.338293241933552 * 6378;
          //mesh.position.y = 0.734195730436108 * 6378;
          //mesh.position.z = 0.5886546626601008 * 6378;
          txtMesh.position.set(-0.338293241933552 * 6395, 0.734195730436108 * 6600, 0.5886546626601008 * 6410);
          txtMesh.rotation.x = -Math.PI / 5;
          txtMesh.rotation.y = -Math.PI / 10;
          group.add(txtMesh);
          //earth.add( mesh );
        
        });   

        //cone.position.x = vec.x * 1;
       //cone.position.y = vec.y * 1;
        //cone.position.z = vec.z * -1;
        //this.earth.add(label);
        //cone.position.x = vec.x * 1;
       //cone.position.y = vec.y * 1;
        //cone.position.z = vec.z * -1;
        //this.scene.add(cone);
        this.earth.add(cone)
    }

    
    _findStationFromMesh = (threeObject) => {
        for (var i = 0; i < this.stations.length; ++i) {
            const s = this.stations[i];

            if (s.mesh === threeObject) return s;
        }

        return null;
    }
}