### Digestors

```js
module.exports = function(filename, metadata, callback){
	if(this_is_not_the_right_digestor_for_the_file){
		return callback(null, true);
	}

	//apply any format-specific metadata to the metadata object
	if(error_when_parsing_the_file){
		callback(err);
	} else {
		callback();
	}
}
```