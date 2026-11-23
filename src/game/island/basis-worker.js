// basis-worker.js — MADE BY scripts/island/basis-worker.mjs; not edited by hand. three.js r160's KTX2Loader worker
// (MIT, three.js authors), verbatim, with Binomial's Basis Universal transcoder (Apache 2.0) brought in from its
// vendored copy: the island's ground maps (terrain.js) are transcoded here, in a worker of the site's own file.
/* constants */
let _EngineFormat = {"RGBAFormat":1023,"RGBA_ASTC_4x4_Format":37808,"RGBA_BPTC_Format":36492,"RGBA_ETC2_EAC_Format":37496,"RGBA_PVRTC_4BPPV1_Format":35842,"RGBA_S3TC_DXT5_Format":33779,"RGB_ETC1_Format":36196,"RGB_ETC2_Format":37492,"RGB_PVRTC_4BPPV1_Format":35840,"RGB_S3TC_DXT1_Format":33776}
let _TranscoderFormat = {"ETC1":0,"ETC2":1,"BC1":2,"BC3":3,"BC4":4,"BC5":5,"BC7_M6_OPAQUE_ONLY":6,"BC7_M5":7,"PVRTC1_4_RGB":8,"PVRTC1_4_RGBA":9,"ASTC_4x4":10,"ATC_RGB":11,"ATC_RGBA_INTERPOLATED_ALPHA":12,"RGBA32":13,"RGB565":14,"BGR565":15,"RGBA4444":16}
let _BasisFormat = {"ETC1S":0,"UASTC_4x4":1}
/* basis_transcoder.js */
importScripts( new URL( '../../vendor/three@0.187.0/examples/jsm/libs/basis/basis_transcoder.js', self.location.href ).href );
/* worker */


	let config;
	let transcoderPending;
	let BasisModule;

	const EngineFormat = _EngineFormat; // eslint-disable-line no-undef
	const TranscoderFormat = _TranscoderFormat; // eslint-disable-line no-undef
	const BasisFormat = _BasisFormat; // eslint-disable-line no-undef

	self.addEventListener( 'message', function ( e ) {

		const message = e.data;

		switch ( message.type ) {

			case 'init':
				config = message.config;
				init( message.transcoderBinary );
				break;

			case 'transcode':
				transcoderPending.then( () => {

					try {

						const { faces, buffers, width, height, hasAlpha, format, dfdFlags } = transcode( message.buffer );

						self.postMessage( { type: 'transcode', id: message.id, faces, width, height, hasAlpha, format, dfdFlags }, buffers );

					} catch ( error ) {

						console.error( error );

						self.postMessage( { type: 'error', id: message.id, error: error.message } );

					}

				} );
				break;

		}

	} );

	function init( wasmBinary ) {

		transcoderPending = new Promise( ( resolve ) => {

			BasisModule = { wasmBinary, onRuntimeInitialized: resolve };
			BASIS( BasisModule ); // eslint-disable-line no-undef

		} ).then( () => {

			BasisModule.initializeBasis();

			if ( BasisModule.KTX2File === undefined ) {

				console.warn( 'THREE.KTX2Loader: Please update Basis Universal transcoder.' );

			}

		} );

	}

	function transcode( buffer ) {

		const ktx2File = new BasisModule.KTX2File( new Uint8Array( buffer ) );

		function cleanup() {

			ktx2File.close();
			ktx2File.delete();

		}

		if ( ! ktx2File.isValid() ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader:	Invalid or unsupported .ktx2 file' );

		}

		const basisFormat = ktx2File.isUASTC() ? BasisFormat.UASTC_4x4 : BasisFormat.ETC1S;
		const width = ktx2File.getWidth();
		const height = ktx2File.getHeight();
		const layerCount = ktx2File.getLayers() || 1;
		const levelCount = ktx2File.getLevels();
		const faceCount = ktx2File.getFaces();
		const hasAlpha = ktx2File.getHasAlpha();
		const dfdFlags = ktx2File.getDFDFlags();

		const { transcoderFormat, engineFormat } = getTranscoderFormat( basisFormat, width, height, hasAlpha );

		if ( ! width || ! height || ! levelCount ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader:	Invalid texture' );

		}

		if ( ! ktx2File.startTranscoding() ) {

			cleanup();
			throw new Error( 'THREE.KTX2Loader: .startTranscoding failed' );

		}

		const faces = [];
		const buffers = [];

		for ( let face = 0; face < faceCount; face ++ ) {

			const mipmaps = [];

			for ( let mip = 0; mip < levelCount; mip ++ ) {

				const layerMips = [];

				let mipWidth, mipHeight;

				for ( let layer = 0; layer < layerCount; layer ++ ) {

					const levelInfo = ktx2File.getImageLevelInfo( mip, layer, face );

					if ( face === 0 && mip === 0 && layer === 0 && ( levelInfo.origWidth % 4 !== 0 || levelInfo.origHeight % 4 !== 0 ) ) {

						console.warn( 'THREE.KTX2Loader: ETC1S and UASTC textures should use multiple-of-four dimensions.' );

					}

					if ( levelCount > 1 ) {

						mipWidth = levelInfo.origWidth;
						mipHeight = levelInfo.origHeight;

					} else {

						// Handles non-multiple-of-four dimensions in textures without mipmaps. Textures with
						// mipmaps must use multiple-of-four dimensions, for some texture formats and APIs.
						// See mrdoob/three.js#25908.
						mipWidth = levelInfo.width;
						mipHeight = levelInfo.height;

					}

					const dst = new Uint8Array( ktx2File.getImageTranscodedSizeInBytes( mip, layer, 0, transcoderFormat ) );
					const status = ktx2File.transcodeImage( dst, mip, layer, face, transcoderFormat, 0, - 1, - 1 );

					if ( ! status ) {

						cleanup();
						throw new Error( 'THREE.KTX2Loader: .transcodeImage failed.' );

					}

					layerMips.push( dst );

				}

				const mipData = concat( layerMips );

				mipmaps.push( { data: mipData, width: mipWidth, height: mipHeight } );
				buffers.push( mipData.buffer );

			}

			faces.push( { mipmaps, width, height, format: engineFormat } );

		}

		cleanup();

		return { faces, buffers, width, height, hasAlpha, format: engineFormat, dfdFlags };

	}

	//

	// Optimal choice of a transcoder target format depends on the Basis format (ETC1S or UASTC),
	// device capabilities, and texture dimensions. The list below ranks the formats separately
	// for ETC1S and UASTC.
	//
	// In some cases, transcoding UASTC to RGBA32 might be preferred for higher quality (at
	// significant memory cost) compared to ETC1/2, BC1/3, and PVRTC. The transcoder currently
	// chooses RGBA32 only as a last resort and does not expose that option to the caller.
	const FORMAT_OPTIONS = [
		{
			if: 'astcSupported',
			basisFormat: [ BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.ASTC_4x4, TranscoderFormat.ASTC_4x4 ],
			engineFormat: [ EngineFormat.RGBA_ASTC_4x4_Format, EngineFormat.RGBA_ASTC_4x4_Format ],
			priorityETC1S: Infinity,
			priorityUASTC: 1,
			needsPowerOfTwo: false,
		},
		{
			if: 'bptcSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.BC7_M5, TranscoderFormat.BC7_M5 ],
			engineFormat: [ EngineFormat.RGBA_BPTC_Format, EngineFormat.RGBA_BPTC_Format ],
			priorityETC1S: 3,
			priorityUASTC: 2,
			needsPowerOfTwo: false,
		},
		{
			if: 'dxtSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.BC1, TranscoderFormat.BC3 ],
			engineFormat: [ EngineFormat.RGB_S3TC_DXT1_Format, EngineFormat.RGBA_S3TC_DXT5_Format ],
			priorityETC1S: 4,
			priorityUASTC: 5,
			needsPowerOfTwo: false,
		},
		{
			if: 'etc2Supported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.ETC1, TranscoderFormat.ETC2 ],
			engineFormat: [ EngineFormat.RGB_ETC2_Format, EngineFormat.RGBA_ETC2_EAC_Format ],
			priorityETC1S: 1,
			priorityUASTC: 3,
			needsPowerOfTwo: false,
		},
		{
			if: 'etc1Supported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.ETC1 ],
			engineFormat: [ EngineFormat.RGB_ETC1_Format ],
			priorityETC1S: 2,
			priorityUASTC: 4,
			needsPowerOfTwo: false,
		},
		{
			if: 'pvrtcSupported',
			basisFormat: [ BasisFormat.ETC1S, BasisFormat.UASTC_4x4 ],
			transcoderFormat: [ TranscoderFormat.PVRTC1_4_RGB, TranscoderFormat.PVRTC1_4_RGBA ],
			engineFormat: [ EngineFormat.RGB_PVRTC_4BPPV1_Format, EngineFormat.RGBA_PVRTC_4BPPV1_Format ],
			priorityETC1S: 5,
			priorityUASTC: 6,
			needsPowerOfTwo: true,
		},
	];

	const ETC1S_OPTIONS = FORMAT_OPTIONS.sort( function ( a, b ) {

		return a.priorityETC1S - b.priorityETC1S;

	} );
	const UASTC_OPTIONS = FORMAT_OPTIONS.sort( function ( a, b ) {

		return a.priorityUASTC - b.priorityUASTC;

	} );

	function getTranscoderFormat( basisFormat, width, height, hasAlpha ) {

		let transcoderFormat;
		let engineFormat;

		const options = basisFormat === BasisFormat.ETC1S ? ETC1S_OPTIONS : UASTC_OPTIONS;

		for ( let i = 0; i < options.length; i ++ ) {

			const opt = options[ i ];

			if ( ! config[ opt.if ] ) continue;
			if ( ! opt.basisFormat.includes( basisFormat ) ) continue;
			if ( hasAlpha && opt.transcoderFormat.length < 2 ) continue;
			if ( opt.needsPowerOfTwo && ! ( isPowerOfTwo( width ) && isPowerOfTwo( height ) ) ) continue;

			transcoderFormat = opt.transcoderFormat[ hasAlpha ? 1 : 0 ];
			engineFormat = opt.engineFormat[ hasAlpha ? 1 : 0 ];

			return { transcoderFormat, engineFormat };

		}

		console.warn( 'THREE.KTX2Loader: No suitable compressed texture format found. Decoding to RGBA32.' );

		transcoderFormat = TranscoderFormat.RGBA32;
		engineFormat = EngineFormat.RGBAFormat;

		return { transcoderFormat, engineFormat };

	}

	function isPowerOfTwo( value ) {

		if ( value <= 2 ) return true;

		return ( value & ( value - 1 ) ) === 0 && value !== 0;

	}

	/** Concatenates N byte arrays. */
	function concat( arrays ) {

		if ( arrays.length === 1 ) return arrays[ 0 ];

		let totalByteLength = 0;

		for ( let i = 0; i < arrays.length; i ++ ) {

			const array = arrays[ i ];
			totalByteLength += array.byteLength;

		}

		const result = new Uint8Array( totalByteLength );

		let byteOffset = 0;

		for ( let i = 0; i < arrays.length; i ++ ) {

			const array = arrays[ i ];
			result.set( array, byteOffset );

			byteOffset += array.byteLength;

		}

		return result;

	}


