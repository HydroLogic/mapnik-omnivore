var gdal          = require('gdal');
var invalid       = require('./invalid.js');
var sphericalMerc = new(require('sphericalmercator'));

module.exports.vector = function(bytes, extent, callback) {
	// Threshold for largest avg tilesize allowed
	var maxSize = 500 * 1024;
	var minzoom = 0;
	var maxzoom = 22;

	// Calculate min/max zoom
	for (var i = maxzoom; i >= 0; i--) {
		var currentzoom = i;

		// Defaulting srs to WGS84 based on how the extent is set in mapnikSetup.getCenterAndExtent() function
		var bounds = sphericalMerc.xyz(extent, currentzoom, false, 4326);
		var x = (bounds.maxX - bounds.minX) + 1;
		var y = (bounds.maxY - bounds.minY) + 1;

		// Number of tiles within current zoom level
		var tiles = x * y;

		if (tiles <= 0) {
			return callback(invalid('Error calculating min/max zoom: Bounds invalid'));
		}
		if (bytes <= 0) {
			return callback(invalid('Error calculating min/max zoom: Total bytes less than or equal to zero'));
		}

		// Average tilesize within current zoom level
		var avgTileSize = bytes / tiles;

		// The idea is that tilesize of ~1000 bytes is usually the most detail needed, and no need to process tiles with higher zoom
		if (avgTileSize < 1000) {
			maxzoom = currentzoom;
		}

		// If avg tile size is small enough to get to one remaining tile, just set minzoom to zero.
		if (avgTileSize > maxSize) {
			minzoom = currentzoom;
			return callback(null, minzoom, maxzoom);
		} else if (tiles === 1 || i === 0) {
			minzoom = 0;
			return callback(null, minzoom, maxzoom);
		}
	};
};

module.exports.raster = function(pixelSize, center, proj, callback) {
	var refFrom = new gdal.SpatialReference.fromProj4(proj);
	var refTo = new gdal.SpatialReference.fromEPSG(3857);
	var transform = new gdal.CoordinateTransformation(refFrom, refTo);

	// Grab half of pixelsize and add/subtract to center longitude to create a horizontal line
	var halfPixelsPerUnit = pixelSize[0]/2;
	var line = new gdal.LineString();
	line.points.add(center[0], (center[1] - halfPixelsPerUnit));
	line.points.add(center[0], (center[1] + halfPixelsPerUnit));

	// Transform native res pixel distance to google mercator pixel distance in meters
	line.transform(transform);
	var mercatorPixelSize = line.getLength();

	// After transforming pixelsize, earth circumference will always be in meters...?
	var circ = 40075000;
	var lat = center[1];
	var res;
	var maxzoom;

	// iterate through zoom levels to find threshold and set maxzoom
	for (var zoom = 19; zoom >= 0; zoom--) {
		// calculate resolution (meters/pixel) for each zoom level
		// S=C*cos(y)/2^(z+8)...from http://wiki.openstreetmap.org/wiki/Zoom_levels
		// calculates for lat north AND south of equator
		res = circ * Math.cos(lat * Math.PI/180) / Math.pow(2,(zoom + 8));
		// use the source's resolution as the threshold
		if (res >= mercatorPixelSize) {
			maxzoom = zoom + 1;
			return callback(null, Math.max(0, maxzoom - 6), maxzoom);
		}
		if (zoom <= 0) {
			return callback(invalid('Failed to set min/max zoom'));
		}
	}
};