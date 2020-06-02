/**
 * @fileoverview Convert the list of cities around the world with a population
 * of more than 15,000 people to a simple JSON array. Convert the list of countries to a
 * simple JSON array.
 *
 * Convert the list of shapes to a simple JSON object mapping the ISO
 * country code to the geoJSON. Load the country data only to map the Geonames ID in
 * joining the two datasets.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const Parsers = require('./parsers');

const wikipedias = Parsers.readJson('../data/wikipedia.json');
const cityData = Parsers.readFileLines('../data/cities15000.txt').map(Parsers.city);
const countries = Parsers.readFileLines('../data/countryInfo.txt');
const countryData = countries.map(line => (Parsers.country(line, wikipedias)));
const shapes = Parsers.readFileLines('../data/shapes_all_low.txt', true);

const SQL_DROP_CITIES = 'DROP TABLE IF EXISTS cities';
const SQL_COLUMNS_CITIES = [
  '"latitude" REAL',
  '"longitude" REAL',
  '"name" TEXT',
  '"country_code" TEXT',
  '"population" INTEGER',
  '"timezone" TEXT',
];
const SQL_CREATE_CITIES = `CREATE TABLE "cities" (${SQL_COLUMNS_CITIES.join(',')})`;
const SQL_INSERT_CITIES = `INSERT INTO cities
  VALUES (${Array(SQL_COLUMNS_CITIES.length).fill('?').join(',')})`;

const SQL_DROP_COUNTRIES = 'DROP TABLE IF EXISTS countries';
const SQL_COLUMNS_COUNTRIES = [
  '"country_code" TEXT',
  '"country_code_ext" TEXT',
  '"name" TEXT',
  '"capital" TEXT',
  '"area" INTEGER',
  '"population" INTEGER',
  '"continent" TEXT',
  '"tld" TEXT',
  '"currency_code" TEXT',
  '"currency_name" TEXT',
  '"phone_country_code" TEXT',
  '"postal_regexp" TEXT',
  '"languages" TEXT',
  '"neighbors" TEXT',
  '"wikipedia" TEXT',
  '"geojson" BLOB',
  '"flag" BLOB',
];
const SQL_CREATE_COUNTRIES = `CREATE TABLE "countries" (${SQL_COLUMNS_COUNTRIES.join(',')})`;
const SQL_INSERT_COUNTRIES = `INSERT INTO countries
  VALUES (${Array(SQL_COLUMNS_COUNTRIES.length).fill('?').join(',')})`;

const infolog = (...args) => { console.info(...args); };

infolog('Save the parsed cities to JSON file');
 Parsers.serializeToFile(
  cityData,
  entity => (JSON.stringify(entity)),
  '[\n  %s\n]\n',
  ',\n  ',
  '../dist/data/cities.json',
);


infolog('Save the parsed countries to JSON file');
Parsers.serializeToFile(
  countryData,
  entity => (JSON.stringify(entity)),
  '[\n  %s\n]\n',
  ',\n  ',
  '../dist/data/countries.json',
);


// Create a mapping of GeoName's ID to ISO country code
const idsToCountry = {};
countries.forEach((countryParts) => {
  idsToCountry[countryParts[16]] = countryParts[0];
});


// Merge the country code with the geoJSON into a mapping
const geojson = {};
shapes.forEach((shapesParts) => {
  const countryCode = idsToCountry[shapesParts[0]];

  if (countryCode) {
    geojson[countryCode] = shapesParts[1];
  }
});

infolog('Save the parsed shapes to JSON files');
Parsers.writeJsonToFiles(geojson, '../dist/geojson/')


// Write the data to a SQLite database file

infolog('Creating the SQLite database');
const db = new sqlite3.Database(path.join(__dirname, '../dist/data/worldcities.sqlite'));

db.serialize(() => {
  db.run('PRAGMA journal_mode = MEMORY');

  infolog('Saving the cities to the database');
  db.run(SQL_DROP_CITIES);
  db.run(SQL_CREATE_CITIES);
  const citiesStmt = db.prepare(SQL_INSERT_CITIES);
  db.parallelize(() => (cityData.forEach(row => (citiesStmt.run(row)))));
  citiesStmt.finalize();

  infolog('Saving the countries to the database');
  db.run(SQL_DROP_COUNTRIES);
  db.run(SQL_CREATE_COUNTRIES);
  const countriesStmt = db.prepare(SQL_INSERT_COUNTRIES);
  countryData.forEach(row => {
    row[12] = row[12].join(',');
    row[13] = row[13].join(',');
    row.push(geojson[row[0]]);
    row.push(Parsers.readSvgFile(`../dist/flags/${row[0].toLowerCase()}.svg`));
    countriesStmt.run(row);
  });
  countriesStmt.finalize();
});

db.close();