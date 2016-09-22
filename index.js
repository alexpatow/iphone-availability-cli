#! /usr/bin/env node

const https = require('https');
const inquirer = require('inquirer');
const NodeGeocoder = require('node-geocoder');
const geolib = require('geolib');
const leftPad = require('left-pad');
const beep = require('beepbeep');
const carriers = ['AT&T', 'Sprint', 'T-Mobile', 'Verizon'];
const iPhoneModels = ['iPhone 7', 'iPhone 7+'];
const iPhoneColors = ['Black', 'Jet Black', 'Silver', 'Gold', 'Rose Gold'];
const iPhoneCapacities = ['32GB', '128GB', '256GB'];
const iPhoneModelsJSON = require('./iPhoneModels.json');
const appleStores = require('./appleStores.json');
var closeStoreLocations = [];
var selectedModel = '';
var interval;
var firstRun = true;
const questions = [
  {
    type: 'input',
    name: 'zip',
    message: 'What\'s your zip code?',
    validate: function (value) {
      var pass = value.match(/^[0-9]{5}(?:-[0-9]{4})?$/);
      if (pass) {
        return true;
      }
      return 'Please enter a valid zip code';
    }
  },
  {
    type: 'input',
    name: 'distance',
    message: 'How many miles would you travel?',
    validate: function (value) {
      var pass = value.match(/^\d+$/);
      if (pass) {
        return true;
      }
      return 'Please enter a valid integer';
    }
  },
  {
    type: 'list',
    name: 'carrier',
    message: 'Which carrier? (Use T-Mobile for Unlocked iPhones)',
    choices: carriers
  },
  {
    type: 'list',
    name: 'model',
    message: 'Which model?',
    choices: iPhoneModels
  },
  {
    type: 'list',
    name: 'color',
    message: 'Which color?',
    choices: iPhoneColors
  },
  {
    type: 'list',
    name: 'capacity',
    message: 'Which capacity?',
    choices: function(answers) {
      if (answers.color === 'Jet Black') {
        return ['128GB', '256GB'];
      }
      return iPhoneCapacities;
    }
  }
];

var availableModels = {};
// Get and validate zip code
inquirer.prompt(questions).then(function (answers) {
  selectedModel = iPhoneModelsJSON[answers.carrier][answers.model][answers.color][answers.capacity];
  const geocoder = NodeGeocoder({
    provider: 'openstreetmap'
  });
  const query = {
    format: 'json',
    postalcode: answers.zip
  }
  geocoder.geocode(query, function(err, res) {
    if (err){
      throw err;
    }
    const location = {
      latitude: res[0].latitude,
      longitude: res[0].longitude
    }
    geocoderResponseHandler(location, answers.distance);
  });
});
// Find stores near that zip code
function geocoderResponseHandler(location, distance) {
  closeStoreLocations = Object.keys(appleStores.locations).map((storeId) => {
    var distanceToLocation = geolib.getDistance(location, appleStores.locations[storeId]) * 0.000621371; //Convert meters to miles
    return {id: storeId, distance: distanceToLocation}
  }).filter((store) => {
    return store.distance < distance;
  });
  if (closeStoreLocations.length === 0) {
    console.log('No stores found within ' + distance + ' miles');
    return;
  }
  requestiPhoneAvailibility();
}

function requestiPhoneAvailibility() {
  console.log('checking...');
  var req = https.get('https://reserve.cdn-apple.com/US/en_US/reserve/iPhone/availability.json', (res) => {
    var body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', function() {
      return handleJSONResponse(body);
    });
    // TODO: handle error
  });
  req.on('error', function(e){
    console.log(e);
  });
}
// Handle response from Apple, comparing to location list and iPhone Model list
function handleJSONResponse(body) {
  var data = JSON.parse(body);
  closeStoreLocations.forEach((location) => {
    formattedLocation = 'R' + leftPad(location.id, 3, 0);
    if (data[formattedLocation]) {
      availableModels[formattedLocation] = data[formattedLocation];
    }
  });
  locationsWherePhoneIsAvailable = [];
  Object.keys(availableModels).forEach((storeId) => {
    if (availableModels[storeId][selectedModel] !== 'NONE') {
      locationsWherePhoneIsAvailable.push(appleStores.stores[storeId]);
    };
  });
  if (locationsWherePhoneIsAvailable.length > 0) {
    beep(2);
    console.log('Your iPhone is available for pickup at these locations:');
    locationsWherePhoneIsAvailable.forEach((location) => {
      console.log(location);
    });
    if (interval) {
      clearInterval(interval);
    }
  } else if (firstRun){
    firstRun = false;
    var interval = setInterval(function() {
      return requestiPhoneAvailibility();
    }, 10000);
    console.log('No iPhones found near you in the model you requested. Press Ctrl-C to change configuration or keep this terminal window open to continue checking.');
  } else {
    console.log('Still none :(');
  }
}
