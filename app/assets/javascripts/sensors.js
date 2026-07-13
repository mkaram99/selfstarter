(function () {
  'use strict';

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) { return '—'; }
    return Number(n).toFixed(digits === undefined ? 2 : digits);
  }

  function setField(name, value) {
    var el = document.querySelector('[data-field="' + name + '"]');
    if (el) { el.textContent = value; }
  }

  function setStatus(section, message) {
    var el = document.querySelector('[data-status="' + section + '"]');
    if (el) { el.textContent = message || ''; }
  }

  function startMotion() {
    if (typeof DeviceMotionEvent === 'undefined' && typeof DeviceOrientationEvent === 'undefined') {
      setStatus('motion', 'Not supported by this browser.');
      return;
    }

    window.addEventListener('devicemotion', function (event) {
      var accel = event.acceleration || event.accelerationIncludingGravity;
      if (accel) {
        setField('accel-x', fmt(accel.x));
        setField('accel-y', fmt(accel.y));
        setField('accel-z', fmt(accel.z));
      }
      if (event.rotationRate) {
        setField('rotation-alpha', fmt(event.rotationRate.alpha));
        setField('rotation-beta', fmt(event.rotationRate.beta));
        setField('rotation-gamma', fmt(event.rotationRate.gamma));
      }
      setStatus('motion', 'Live');
    });

    window.addEventListener('deviceorientation', function (event) {
      setField('orientation-alpha', fmt(event.alpha, 1));
      setField('orientation-beta', fmt(event.beta, 1));
      setField('orientation-gamma', fmt(event.gamma, 1));
    });
  }

  function requestMotionPermission() {
    var needsPermission = typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';

    if (!needsPermission) {
      startMotion();
      return;
    }

    DeviceMotionEvent.requestPermission().then(function (state) {
      if (state === 'granted') {
        startMotion();
      } else {
        setStatus('motion', 'Permission denied.');
      }
    }).catch(function () {
      setStatus('motion', 'Permission request failed.');
    });
  }

  function startLocation() {
    if (!('geolocation' in navigator)) {
      setStatus('location', 'Not supported by this browser.');
      return;
    }

    navigator.geolocation.watchPosition(function (position) {
      var coords = position.coords;
      setField('lat', fmt(coords.latitude, 6));
      setField('lon', fmt(coords.longitude, 6));
      setField('accuracy', fmt(coords.accuracy, 1));
      setField('altitude', coords.altitude === null ? '—' : fmt(coords.altitude, 1) + ' m');
      setField('speed', coords.speed === null ? '—' : fmt(coords.speed, 1) + ' m/s');
      setField('heading', coords.heading === null ? '—' : fmt(coords.heading, 1) + '°');
      setStatus('location', 'Live');
    }, function (error) {
      setStatus('location', 'Error: ' + error.message);
    }, {
      enableHighAccuracy: true,
      maximumAge: 1000
    });
  }

  function startLight() {
    var supported = false;

    if (typeof AmbientLightSensor === 'function') {
      supported = true;
      try {
        var lightSensor = new AmbientLightSensor();
        lightSensor.addEventListener('reading', function () {
          setField('light', fmt(lightSensor.illuminance, 0));
          setStatus('light', 'Live');
        });
        lightSensor.addEventListener('error', function (event) {
          setStatus('light', 'Error: ' + event.error.message);
        });
        lightSensor.start();
      } catch (e) {
        setStatus('light', 'Permission denied or unavailable.');
      }
    } else if ('ondevicelight' in window) {
      supported = true;
      window.addEventListener('devicelight', function (event) {
        setField('light', fmt(event.value, 0));
        setStatus('light', 'Live');
      });
    }

    if (typeof ProximitySensor === 'function') {
      supported = true;
      try {
        var proximitySensor = new ProximitySensor();
        proximitySensor.addEventListener('reading', function () {
          setField('proximity', fmt(proximitySensor.distance, 1));
        });
        proximitySensor.start();
      } catch (e) {
        // Proximity permission/availability failure is reported via the light status.
      }
    } else if ('ondeviceproximity' in window) {
      supported = true;
      window.addEventListener('deviceproximity', function (event) {
        setField('proximity', fmt(event.value, 1));
      });
    }

    if (!supported) {
      setStatus('light', 'Not supported by this browser.');
    }
  }

  function startMonitoring() {
    requestMotionPermission();
    startLocation();
    startLight();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var dashboard = document.getElementById('sensor-dashboard');
    if (!dashboard) { return; }

    var button = document.getElementById('start-monitoring');
    var globalStatus = document.getElementById('global-status');

    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = 'Monitoring…';
      if (globalStatus) { globalStatus.textContent = 'Requesting permissions…'; }
      startMonitoring();
    });
  });
})();
