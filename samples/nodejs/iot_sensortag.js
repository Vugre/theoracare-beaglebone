//*****************************************************************************
// Copyright (c) 2014 IBM Corporation and other Contributors.
//
// All rights reserved. This program and the accompanying materials
// are made available under the terms of the Eclipse Public License v1.0
// which accompanies this distribution, and is available at
// http://www.eclipse.org/legal/epl-v10.html 
//
// Contributors:
//  IBM - Initial Contribution
//      - update for iot-2, registration and commands
//*****************************************************************************

// IoT Cloud Example Client
// To run on a BeagleBone Black equipped with a BLE USB adaptor connecting a Texas Instruments SenstorTag CC2451

var util = require('util');
var async = require('async');
var SensorTag = require('sensortag');
var mqtt = require('mqtt');
var getmac = require('getmac');
var properties = require('properties');
var fs = require('fs');

// constants
var u_port = "1883";
var s_port = "8883";
var pub_topic = "iot-2/evt/sample/fmt/json";
var sub_topic = "iot-2/cmd/blink/fmt/json";
var qs_org = "quickstart";
var reg_domain = ".messaging.internetofthings.ibmcloud.com";
var qs_host = "quickstart.messaging.internetofthings.ibmcloud.com";
var qs_type = "iotsample-ti-bbst";
var configFile = "./device.cfg";
var ledPath ="/sys/class/leds/beaglebone:green:usr";
var caCerts = ["./IoTFoundation.pem", "IoTFoundation-CA.pem"];


// globals
var qs_mode = true;
var tls = false;
var org = qs_org;
var type = qs_type;
var host = qs_host;
var deviceId;
var password;
var username;




// LED functions
// run asynchronously, callbacks just trap unexpected errors
function ledWrite(extra, content, callback) {
  fs.writeFile(ledPath+extra, content, function(err) {
	if (err) throw err;
  });
  if (callback) callback();
}

// set the trigger: none, nand-disk, mmc0, mmc1, timer, oneshot, cpu, heartbeat, backlight, gpio ...
function ledTrigger(led, trigger, callback) {
	ledWrite(led+"/trigger", trigger, callback);
}

// with oneshot trigger
function ledShot(led, callback) {
	ledWrite(led+"/shot", "1", callback);
}

// set blink or not
function ledBlink(led, rate) {
	//console.log("LED " + rate);
	if (rate) {
	  ledWrite(led+"/delay_on", parseInt(400/rate));
      ledWrite(led+"/delay_off", parseInt(400/rate));
	} else {
	  ledWrite(led+"/delay_on", 1);
	  ledWrite(led+"/delay_off", 10000);	
	}
}

// initial modes
ledTrigger(0, "timer");
ledTrigger(1, "none");
ledTrigger(2, "none");
ledTrigger(3, "oneshot");


// event data object
var tagData = {};
tagData.d = {};
tagData.toJson = function() {
	return JSON.stringify(this);
};
tagData.publish = function() {
	// dont publish unless there is a full set of data
	// alternative: only enable publish when most sensortag callbacks have fired

	if (tagData.d.hasOwnProperty("temp")) {
		client.publish(pub_topic, tagData.toJson());
		ledShot(3);
		//console.log(pub_topic, tagData.toJson()); // trace
	}
};

// error report
function missing(what) {
	console.log("No " + what + " in " + configFile);
	process.exit(1);
}

// called on message received
function doCommand(topic, message, packet) {
	console.log("received command: " + topic + " msg: " + message);
	var topics = topic.split('/');
	switch(topics[2]) {
	case "blink": 
		var payload = JSON.parse(message);
		ledBlink(0, payload.interval);
		break;
	default:
		console.log("Unxpected Command: " + topics[2]);
	}
}

console.log('Press the side button on the SensorTag to connect');
SensorTag.discover(function(sensorTag) {

	sensorTag.on('disconnect', function() {
		console.log('Tag Disconnected');
		process.exit(0);
	});

	// run functions in series
	async.series([
			function(callback) { // read config file if any
				properties.parse(configFile, {
					path : true
				}, function(err, config) {
					if (err && err.code != 'ENOENT')
						throw err;
					if (config) {
						
						org = config.org || missing('org');
						type = config.type || missing('type');
						deviceId = config.id || missing('id');
						password = config['auth-token'] || missing('auth-token');
						var method = config['auth-method'] || missing('auth-method');
						if (method != 'token') {
							console.log("unexpected auth-method = " + method);
							process.exit(1);
						}
						username = 'use-token-auth';
						host = org + reg_domain;
						tls = true;
						qs_mode = false;
					}
					callback();
				});
			},
			function(callback) { // fill deviceId
				if (qs_mode && !deviceId) {
					getmac.getMac(function(err, macAddress) {
						if (err)
							throw err;
						deviceId = macAddress.replace(/:/g, '').toLowerCase();
						callback();
					});
				} else
					callback();
			},
			function(callback) {
				console.log('SensorTag connected');
				sensorTag.connect(callback);
			},
			function(callback) {
				console.log('Discovering services and characteristics');
				sensorTag.discoverServicesAndCharacteristics(callback);
			},
			function(callback) {
				sensorTag.readDeviceName(function(deviceName) {
					console.log('Device name = ' + deviceName);
					tagData.d.myName = deviceName;
					callback();
				});
			},
			function(callback) {
				sensorTag.readSystemId(function(systemId) {
					console.log('System id = ' + systemId);
					callback();
					tagData.d.myName += " " + systemId;
				});
			},
			function(callback) {
				sensorTag.readSerialNumber(function(serialNumber) {
					console.log('Serial number = ' + serialNumber);
					callback();
				});
			},
			function(callback) {
				sensorTag.readFirmwareRevision(function(firmwareRevision) {
					console.log('Firmware revision = ' + firmwareRevision);
					callback();
				});
			},
			function(callback) {
				sensorTag.readHardwareRevision(function(hardwareRevision) {
					console.log('Hardware revision = ' + hardwareRevision);
					callback();
				});
			},
			function(callback) {
				sensorTag.readHardwareRevision(function(softwareRevision) {
					console.log('Software revision = ' + softwareRevision);
					callback();
				});
			},
			function(callback) {
				sensorTag.readManufacturerName(function(manufacturerName) {
					console.log('Manufacturer name = ' + manufacturerName);
					callback();
				});
			},
			function(callback) {
				console.log('Enable IR temperature');
				sensorTag.enableIrTemperature(callback);
			},
			function(callback) {
				console.log('Enable accelerometer');
				sensorTag.enableAccelerometer(callback);
			},
			function(callback) {
				sensorTag.setAccelerometerPeriod(1000, callback);
			},
			function(callback) {
				console.log('Enable humidity sensor');
				sensorTag.enableHumidity(callback);
			},
			function(callback) {
				console.log('Enable magnetometer');
				sensorTag.enableMagnetometer(callback);
			},
			function(callback) {
				sensorTag.setMagnetometerPeriod(1000, callback);
			},
			function(callback) {
				console.log('Enable barometer');
				sensorTag.enableBarometricPressure(callback);
			},
			function(callback) {
				console.log('Enable gyroscope');
				sensorTag.enableGyroscope(callback);
			},
			function(callback) { // connect MQTT client
				var clientId = "d:" + org + ":" + type + ":" + deviceId;
				console.log('MQTT clientId = ' + clientId);
				if (qs_mode) {
					client = mqtt.createClient(u_port, host, {
						clientId : clientId,
						keepalive : 30
					});
				} else {
					if (tls) {
						console.log("TLS connect: " + host + ":" + s_port);
						client = mqtt.createSecureClient(s_port, host, {
							clientId : clientId,
							keepalive : 30,
							username : username,
							password : password,
							rejectUnauthorized: true,
							ca: caCerts
						});
					} else {
						console.log("Connect host: " + host + " port " + u_port);
						client = mqtt.createClient(u_port, host, {
							clientId : clientId,
							keepalive : 30,
							username : username,
							password : password
						});
					}
				}
				client.on('connect', function() {
					// not reliable since event may fire before handler
					// installed
					console.log('MQTT Connected');
					console.log("Sending data")
					if (qs_mode) {
						console.log('MAC address = ' + deviceId);
						console.log('Go to the following link to see your device data;');
						console.log('http://quickstart.internetofthings.ibmcloud.com/#/device/' + deviceId + '/sensor/')
					}
				});
				client.on('error', function(err) {
					console.log('client error' + err);
					process.exit(1);
				});
				client.on('close', function() {
					console.log('client closed');
					process.exit(1);
				});
				callback();
			},
			function(callback) {
				ledBlink(0, 0); // turn off
				if (!qs_mode) {
					client.subscribe(sub_topic, { qos: 0 }, function(err, granted) { 
						if (err) throw err;
						console.log('Subscribed to ' + sub_topic);
						callback();
					});
					client.on('message', doCommand);
				} else {
					callback();
				}
			},
			function(callback) {
				setTimeout(callback, 2000);
				setInterval(function(tag) {
					tag.publish();

					fs.appendFile('../data.txt', 'Date: ' + tagData.d.date + "\n" +
					'objectTemp: ' + tagData.d.objectTemp + "\n" +
					'ambientTemp: ' + tagData.d.ambientTemp + "\n" +
					'accelX: ' + tagData.d.accelX + "\n" +
					'accelY: ' + tagData.d.accelY + "\n" +
					'accelZ: ' + tagData.d.accelZ + "\n" +
					"humidity: " + tagData.d.humidity + "\n" +
					"temp: " + tagData.d.temp + "\n" +
					'magX: ' + tagData.d.magX + "\n" +
					'magY: ' + tagData.d.magY + "\n" +
					'magZ: ' + tagData.d.magZ + "\n" +
					'pressure: ' + tagData.d.pressure + "\n" +
					'gyroX: ' + tagData.d.gyroX + "\n" +
					'gyroY: ' + tagData.d.gyroY + "\n" +
					'gyroZ: ' + tagData.d.gyroZ + "\n" +
					'leftKey: ' + tagData.d.leftKey + "\n" +
					'rightKey: ' + tagData.d.rightKey + "\n" + ' ' + "\n", function (err) {
					});
				}, 2000, tagData);
			},
			function(callback) {
				sensorTag.on('irTemperatureChange', function(objectTemperature,
						ambientTemperature) {
					tagData.d.objectTemp = parseFloat(objectTemperature.toFixed(1));
					tagData.d.ambientTemp = parseFloat(ambientTemperature.toFixed(1));
					
					
					//console.log('objectTemp: ' + tagData.d.objectTemp );
					//fs.appendFile('../data.txt', 'objectTemp: ' + tagData.d.objectTemp + "\n" , function (err) {
					//});
					//console.log('ambientTemp: ' + tagData.d.ambientTemp );
					//fs.appendFile('../data.txt', 'ambientTemp: ' + tagData.d.ambientTemp + "\n" , function (err) {
					//});
				});

				sensorTag.notifyIrTemperature(function() {

				});

				callback();
			}, function(callback) {
				sensorTag.on('accelerometerChange', function(x, y, z) {
					tagData.d.accelX = parseFloat(x.toFixed(1));
					tagData.d.accelY = parseFloat(y.toFixed(1));
					tagData.d.accelZ = parseFloat(z.toFixed(1));
					
					//fs.appendFile('../data.txt', 'accelX: ' + tagData.d.accelX + "\n" , function (err) {
					//});
					//console.log('accelX: ' + tagData.d.accelX );
					
					//fs.appendFile('../data.txt', 'accelY: ' + tagData.d.accelY + "\n" , function (err) {
					//});
					//console.log('accelY: ' + tagData.d.accelY );
					
					//fs.appendFile('../data.txt', 'accelZ: ' + tagData.d.accelZ + "\n" , function (err) {
					//});
					//console.log('accelZ: ' + tagData.d.accelZ );
					
				});

				sensorTag.notifyAccelerometer(function() {

				});

				callback();
			}, function(callback) {
				sensorTag.on('humidityChange', function(temperature, humidity) {
					tagData.d.humidity = parseFloat(humidity.toFixed(1));
					tagData.d.temp = parseFloat(temperature.toFixed(1));
					
					//fs.appendFile('../data.txt', "humidity: " + tagData.d.humidity + "\n", function (err) {
					//});
					//console.log('humidity: ' + tagData.d.humidity);
					
					//fs.appendFile('../data.txt', "temp: " + tagData.d.temp + "\n", function (err) {
					//});
					//console.log('temp: ' + tagData.d.temp);
					


				});

				sensorTag.notifyHumidity(function() {

				});

				callback();
			}, function(callback) {
				sensorTag.on('magnetometerChange', function(x, y, z) {
					
					var date = new Date();
					var date2 = new Date();
					
					date2.setHours(date.getHours() - 5);
					
					tagData.d.date = date2;
					
					//fs.appendFile('../data.txt', 'Date: ' + date2 + "\n" , function (err) {
					//});
					//console.log('Date: ' + date2 );
					
					
					
					tagData.d.magX = parseFloat(x.toFixed(1));
					tagData.d.magY = parseFloat(y.toFixed(1));
					tagData.d.magZ = parseFloat(z.toFixed(1));
					
					//fs.appendFile('../data.txt', 'magX: ' + tagData.d.magX + "\n" , function (err) {
					//});
					//console.log('magX: ' + tagData.d.magX );
					
					//fs.appendFile('../data.txt', 'magY: ' + tagData.d.magY + "\n" , function (err) {
					//});
					//console.log('magY: ' + tagData.d.magY );
					
					//fs.appendFile('../data.txt', 'magZ: ' + tagData.d.magZ + "\n" , function (err) {
					//});
					//console.log('magZ: ' + tagData.d.magZ );
					
				});

				sensorTag.notifyMagnetometer(function() {

				});

				callback();
			}, function(callback) {
				sensorTag.on('barometricPressureChange', function(pressure) {
					tagData.d.pressure = parseFloat(pressure.toFixed(1));
					//fs.appendFile('../data.txt', 'pressure: ' + tagData.d.pressure + "\n" , function (err) {
					//});
					//console.log('pressure: ' + tagData.d.pressure );
					
				});

				sensorTag.notifyBarometricPressure(function() {

				});

				callback();
			},

			function(callback) {
				sensorTag.on('gyroscopeChange', function(x, y, z) {
					tagData.d.gyroX = parseFloat(x.toFixed(1));
					tagData.d.gyroY = parseFloat(y.toFixed(1));
					tagData.d.gyroZ = parseFloat(z.toFixed(1));
					
				//	fs.appendFile('../data.txt', 'gyroX: ' + tagData.d.gyroX + "\n" , function (err) {
					//});
					//console.log('gyroX: ' + tagData.d.gyroX );
					
					//fs.appendFile('../data.txt', 'gyroY: ' + tagData.d.gyroY + "\n" , function (err) {
					//});
					//console.log('gyroY: ' + tagData.d.gyroY );
					
					//fs.appendFile('../data.txt', 'gyroZ: ' + tagData.d.gyroZ + "\n" , function (err) {
					//});
					//console.log('gyroZ: ' + tagData.d.gyroZ );
					
					//fs.appendFile('../data.txt', "\n" , function (err) {
					//});
					//console.log(' ' );
					
				});

				sensorTag.notifyGyroscope(function() {

				});
				callback();
			},

			function(callback) {
				sensorTag.on('simpleKeyChange', function(left, right) {
					tagData.d.leftKey = left;
					tagData.d.rightKey = right;
					//fs.appendFile('../data.txt', 'leftKey: ' + tagData.d.leftKey + "\n" , function (err) {
					//});
					//fs.appendFile('../data.txt', 'rightkey: ' + tagData.d.rightkey + "\n" , function (err) {
					//});
					//console.log('keys left: ' + left + '  right: ' + right);

					if (left && right) {
						sensorTag.notifySimpleKey(callback);
					}
				});

				sensorTag.notifySimpleKey(function() {

				});
			}, function(callback) {
				console.log('disconnect');
				sensorTag.disconnect(callback);
			} ]);
});
