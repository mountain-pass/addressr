/**
 * Get Addresses
 * returns detailed information about a specific address
 *
 * addressId String ID of the address.
 * returns Address
 **/
exports.getAddress = function(/*addressId*/) {
  return new Promise(function(resolve /*, reject*/) {
    var examples = {};
    examples['application/json'] = {
      geo: {
        level: {
          code: 7,
          name: 'LOCALITY,STREET, ADDRESS',
        },
        reliability: {
          code: 2,
          name: 'WITHIN ADDRESS SITE BOUNDARY OR ACCESS POINT',
        },
        latitude: -33.85351875,
        longitude: 150.8947369,
      },
      structured: {
        buildingName: 'Vickery Lodge',
        number: {
          number: 20114,
          prefix: 'RMB',
          suffix: 'AA',
          second: {
            number: '20114',
            prefix: 'RMB',
            suffix: 'C',
          },
        },
        level: {
          number: 64,
          code: 'OD',
          prefix: 'A',
          type: 'Observation Deck',
          suffix: 'QG',
        },
        flat: {
          number: '20114',
          code: 'Twr',
          prefix: 'CT',
          type: 'Tower',
          suffix: 'AG',
        },
        street: {
          code: 'Avenue',
          name: 'Barangaroo',
          type: 'Av',
          suffix: {
            code: 'De',
            name: 'Deviation',
          },
        },
        confidence: 0,
        locality: {
          name: 'Sydney',
        },
        postcode: '2000',
        lotNumber: {
          number: 'CP',
          prefix: 'A',
          suffix: 'B',
        },
        state: {
          name: 'New South Wales',
          abbreviation: 'NSW',
        },
      },
      sla: 'Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000',
      pid: 'GANT_718592778',
      fla: '',
    };
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
};

/**
 * Get List of Addresses
 * returns a list of addresses matching the search string
 *
 * q String search string (optional)
 * p Integer page number (optional)
 * returns List
 **/
exports.getAddresses = function(/*q, p*/) {
  return new Promise(function(resolve /*reject*/) {
    var examples = {};
    examples['application/json'] = [
      {
        sla: 'Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000',
        score: 1,
        links: {
          self: {
            href: '/address/GANT_718592778',
          },
        },
      },
      {
        sla: '109 Kirribilli Ave, Kirribilli NSW 2061',
        score: 0.985051936618461,
        links: {
          self: {
            href: '/address/GANT_718592782',
          },
        },
      },
    ];
    if (Object.keys(examples).length > 0) {
      resolve(examples[Object.keys(examples)[0]]);
    } else {
      resolve();
    }
  });
};
