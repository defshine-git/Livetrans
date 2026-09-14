// ==========================================
// Embedded QRCode Generator (Kazuhiko Arase / MIT License)
// ==========================================
(function(global) {
// --- QRMode.js ---
var QRMode = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

// --- QR8bitByte.js ---
function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

// --- QRBitBuffer.js ---
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

// --- QRErrorCorrectLevel.js ---
var QRErrorCorrectLevel = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};

// --- QRMaskPattern.js ---
var QRMaskPattern = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

// --- QRMath.js ---
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

// --- QRPolynomial.js ---
function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		return new QRPolynomial(num, 0).mod(e);
	}
};

// --- QRRSBlock.js ---
function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [
	// 1
	[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
	// 2
	[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
	// 3
	[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
	// 4		
	[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
	// 5
	[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
	// 6
	[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
	// 7		
	[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
	// 8
	[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
	// 9
	[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
	// 10		
	[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
	// 11
	[4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
	// 12
	[2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
	// 13
	[4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
	// 14
	[3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
	// 15
	[5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12],
	// 16
	[5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
	// 17
	[1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
	// 18
	[5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
	// 19
	[3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
	// 20
	[3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
	// 21
	[4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
	// 22
	[2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
	// 23
	[4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
	// 24
	[6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
	// 25
	[8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
	// 26
	[10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
	// 27
	[8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
	// 28
	[3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
	// 29
	[7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
	// 30
	[5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
	// 31
	[13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
	// 32
	[17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
	// 33
	[17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
	// 34
	[13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
	// 35
	[12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
	// 36
	[6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
	// 37
	[17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
	// 38
	[4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
	// 39
	[20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
	// 40
	[19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}
	var length = rsBlock.length / 3;
	var list = [];
	for (var i = 0; i < length; i++) {
		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];
		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default : return undefined;
	}
};

// --- QRUtil.js ---
var QRUtil = {
    PATTERN_POSITION_TABLE : [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
        [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
        [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
        [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {
        var digit = 0;
        while (data !== 0) {
            digit++;
            data >>>= 1;
        }
        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        switch (maskPattern) {
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;
        default : throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }
        return a;
    },

    getLengthInBits : function(mode, type) {
        if (1 <= type && type < 10) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default : throw new Error("mode:" + mode);
            }
        } else if (type < 27) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default : throw new Error("mode:" + mode);
            }
        } else if (type < 41) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default : throw new Error("mode:" + mode);
            }
        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount; col++) {
                var sameCount = 0;
                var dark = qrCode.isDark(row, col);
                for (var r = -1; r <= 1; r++) {
                    if (row + r < 0 || moduleCount <= row + r) continue;
                    for (var c = -1; c <= 1; c++) {
                        if (col + c < 0 || moduleCount <= col + c) continue;
                        if (r === 0 && c === 0) continue;
                        if (dark === qrCode.isDark(row + r, col + c) ) sameCount++;
                    }
                }
                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }
        
        var darkCount = 0;
        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) darkCount++;
            }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;       
    }
};

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		// [BUG FIX] typeNumber loop bounds check: changed `< 40` to `<= 40`
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber <= 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = Math.min(40, typeNumber);
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			this.modules[row] = new Array(this.moduleCount);
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		for (var r = -1; r <= 7; r++) {
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			for (var c = -1; c <= 7; c++) {
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
		var minLostPoint = 0;
		var pattern = 0;
		for (var i = 0; i < 8; i++) {
			this.makeImpl(true, i);
			var lostPoint = QRUtil.getLostPoint(this);
			if (i === 0 || minLostPoint > lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
		return pattern;
	},

	setupTimingPattern : function() {
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) continue;
			this.modules[r][6] = (r % 2 === 0);
		}
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) continue;
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		for (var i = 0; i < pos.length; i++) {
			for (var j = 0; j < pos.length; j++) {
				var row = pos[i];
				var col = pos[j];
				if (this.modules[row][col] !== null) continue;
				for (var r = -2; r <= 2; r++) {
					for (var c = -2; c <= 2; c++) {
						if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
		for (var v = 0; v < 15; v++) {
			mod = (!test && ( (bits >> v) & 1) === 1);
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
		for (var h = 0; h < 15; h++) {
			mod = (!test && ( (bits >> h) & 1) === 1);
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
		this.modules[this.moduleCount - 8][8] = (!test);
	},
	
	mapData : function(data, maskPattern) {
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
			if (col === 6) col--;
			while (true) {
				for (var c = 0; c < 2; c++) {
					if (this.modules[row][col - c] === null) {
						var dark = false;
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
						var mask = QRUtil.getMask(maskPattern, row, col - c);
						if (mask) {
							dark = !dark;
						}
						this.modules[row][col - c] = dark;
						bitIndex--;
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
				row += inc;
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
	}
};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
	}

	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	while (true) {
		if (buffer.getLengthInBits() >= totalDataCount * 8) break;
		buffer.put(QRCode.PAD0, 8);
		if (buffer.getLengthInBits() >= totalDataCount * 8) break;
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {
	var offset = 0;
	var maxDcCount = 0;
	var maxEcCount = 0;
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {
		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;
		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		dcdata[r] = new Array(dcCount);
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}
	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;
};

QRCode.QRErrorCorrectLevel = QRErrorCorrectLevel;

QRCode.renderCanvas = function(canvas, text, options) {
    options = options || {};
    var size = options.size || 240;
    var margin = options.margin !== undefined ? options.margin : 2;
    var darkColor = options.dark || '#1F2328';
    var lightColor = options.light || '#FFFFFF';

    var qr = new QRCode(0, QRErrorCorrectLevel.L);
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;

    var totalModules = count + margin * 2;
    var cellSize = size / totalModules;

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = darkColor;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(
            Math.round((c + margin) * cellSize),
            Math.round((r + margin) * cellSize),
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          );
        }
      }
    }
};

global.QRCode = QRCode;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/**
 * app.js - Robust Frontend Logic for Gemini Live Bilingual Translator
 * Version: 2.5.0 (Bilingual Transcriber UI Grid & Audit Enhanced)
 * 
 * Features:
 * 1. 2-Column Body Grid (原文 / 訳文) with responsive single-column layout.
 * 2. Role rotation tags: Auditor (監査員), Yard Rep (ヤード担当者), Facility (施設側), Other (その他).
 * 3. In-place card actions: Edit (✏️), Retry (🔄), Delete (🗑️), Copy (📋).
 * 4. Dedicated Live Transcription Banner with audio meter.
 * 5. Full Markdown table copy for meeting minutes.
 * 6. Hardened Gemini Live 10-min Resumption, Cascade Translation, and Differential Docs Sync.
 */

const ROLES = [
  'Auditor (監査員)',
  'Yard Rep (ヤード担当者)',
  'Facility (施設側)',
  'Other (その他)'
];

// ==========================================
// 1. Config Manager (localStorage)
// ==========================================
class ConfigManager {
  static STORAGE_KEYS = {
    API_KEY: 'glt_gemini_api_key',
    GAS_URL: 'glt_gas_web_app_url',
    GAS_TOKEN: 'glt_gas_token',
    DIRECTION: 'glt_translation_direction',
    CATEGORY: 'glt_category',
    AUTO_SAVE: 'glt_auto_save_enabled',
    DOC_MODE: 'glt_doc_mode',
    FOLDER_ID: 'glt_output_folder_id',
    GAIN: 'glt_mic_gain',
    LAST_DOC_ID: 'glt_last_doc_id',
    ENGINE_MODE: 'glt_engine_mode',
    LIVE_MODEL: 'glt_live_model'
  };

  static get(key, defaultValue = '') {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  }
}

// ==========================================
// 2. Audio Capture Service (Anti-Aliased 16kHz PCM)
// ==========================================
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.highpassNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.filterNode = null;
    this.analyserNode = null;
    this.processorNode = null;
    this.isRecording = false;
    this.isPaused = false;
    this.gainValue = 2.5; // 遠距離集音ブースト初期値 (推奨 2.5x)
    this.onChunkCallback = null;
    this.onVolumeCallback = null;

    // Buffer pooling to eliminate garbage collection latency spikes
    this._cachedBuffer = null;
  }

  setGain(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      this.gainValue = num;
      if (this.gainNode && this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.gainNode.gain.setTargetAtTime(this.gainValue, this.audioContext.currentTime, 0.05);
        } catch (e) {
          this.gainNode.gain.value = this.gainValue;
        }
      }
    }
  }

  ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('お使いのブラウザは Web Audio API に対応していません。');
      }
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      return this.audioContext.resume();
    }
    return Promise.resolve();
  }

  async start(onChunk, onVolume) {
    if (this.isRecording) return;
    this.onChunkCallback = onChunk;
    this.onVolumeCallback = onVolume;

    await this.ensureContext();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('マイクアクセスAPIが利用できません。HTTPS または http://localhost 上でアクセスしてください。');
    }

    try {
      // Optimized audio constraints: avoid overly aggressive noiseSuppression which cuts distant voices
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false, // Disabled to prevent cutting distant soft speech
          autoGainControl: true,
          googAutoGainControl: true,
          googNoiseSuppression: false,
          googHighpassFilter: false
        }
      });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('マイクへのアクセスが拒否されました。ブラウザのアドレスバーからマイク使用を許可してください。');
      } else if (err.name === 'NotFoundError') {
        throw new Error('利用可能なマイク機器が見つかりませんでした。');
      } else {
        throw new Error(`マイクの取得に失敗しました: ${err.message}`);
      }
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 1. Highpass Filter: 80Hz cutoff (removes AC hum, room rumble, and desk vibrations without affecting vocal clarity)
    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.value = 80;
    this.highpassNode.Q.value = 0.7;

    // 2. Pre-amp Gain Booster: Amplifies distant/soft speech to ensure reliable ASR feature extraction
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.gainValue;

    // 3. Dynamics Compressor: Automatically manages dynamic range, boosting weak distant voices while preventing near-mic clipping
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -32; // dB (wide capture threshold)
    this.compressorNode.knee.value = 24;      // dB (smooth compression onset)
    this.compressorNode.ratio.value = 8;       // 8:1 (firm peak limiter)
    this.compressorNode.attack.value = 0.003;  // 3ms fast attack
    this.compressorNode.release.value = 0.20;  // 200ms natural recovery

    // 4. Lowpass Anti-Aliasing Filter: 7.5kHz cutoff for clean 16kHz target downsampling
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 7500;

    // Signal Routing: Source -> Highpass -> Gain -> Compressor -> Lowpass -> Destination
    this.sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.gainNode);
    this.gainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.filterNode);

    // Analyser for real-time volume metering
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.filterNode.connect(this.analyserNode);

    // Audio Processor (buffer: 2048 samples = ~128ms chunks)
    const bufferSize = 2048;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    // Retain global reference to avoid GC reclamation
    if (typeof window !== 'undefined') {
      window._activeAudioProcessorNode = this.processorNode;
    }

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;

    this.processorNode.onaudioprocess = (e) => {
      const outputBuffer = e.outputBuffer.getChannelData(0);
      outputBuffer.fill(0); // Feedback mute

      if (!this.isRecording || this.isPaused) return;

      const inputBuffer = e.inputBuffer.getChannelData(0);

      if (this.onVolumeCallback && this.analyserNode) {
        let sum = 0;
        const len = inputBuffer.length;
        for (let i = 0; i < len; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / len);
        this.onVolumeCallback(rms);
      }

      const downsampled = this._downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate);
      const base64Chunk = this._int16ToBase64(downsampled);

      if (this.onChunkCallback && base64Chunk) {
        this.onChunkCallback(base64Chunk);
      }
    };

    this.filterNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;
    this.isPaused = false;
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }

  stop() {
    this.isRecording = false;
    this.isPaused = false;
    if (typeof window !== 'undefined') window._activeAudioProcessorNode = null;
    if (this.processorNode) { try { this.processorNode.disconnect(); } catch (e) {} this.processorNode = null; }
    if (this.analyserNode) { try { this.analyserNode.disconnect(); } catch (e) {} this.analyserNode = null; }
    if (this.filterNode) { try { this.filterNode.disconnect(); } catch (e) {} this.filterNode = null; }
    if (this.compressorNode) { try { this.compressorNode.disconnect(); } catch (e) {} this.compressorNode = null; }
    if (this.gainNode) { try { this.gainNode.disconnect(); } catch (e) {} this.gainNode = null; }
    if (this.highpassNode) { try { this.highpassNode.disconnect(); } catch (e) {} this.highpassNode = null; }
    if (this.sourceNode) { try { this.sourceNode.disconnect(); } catch (e) {} this.sourceNode = null; }
    if (this.mediaStream) { try { this.mediaStream.getTracks().forEach((track) => track.stop()); } catch (e) {} this.mediaStream = null; }
    if (this.audioContext) { this.audioContext.close().catch(() => {}); this.audioContext = null; }
  }

  // Highly optimized buffer pooling downsampler: zero allocation in audio loop
  _downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      const len = buffer.length;
      if (!this._cachedBuffer || this._cachedBuffer.length !== len) {
        this._cachedBuffer = new Int16Array(len);
      }
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        this._cachedBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return this._cachedBuffer;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    if (!this._cachedBuffer || this._cachedBuffer.length !== newLength) {
      this._cachedBuffer = new Int16Array(newLength);
    }
    const result = this._cachedBuffer;
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // Optimized chunk encoder with pre-sized typed view
  _int16ToBase64(int16Array) {
    const uint8 = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    const len = uint8.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = uint8.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
}

// ==========================================
// 3. Web Speech API Service (Native Fallback)
// ==========================================
class WebSpeechService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isPaused = false;
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onErrorCallback = null;
    this.direction = 'auto';
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  setDirection(direction) {
    this.direction = direction;
    if (this.recognition && this.isListening) {
      const targetLang = this.direction === 'en-to-ja' ? 'en-US' : 'ja-JP';
      if (this.recognition.lang !== targetLang) {
        this.recognition.lang = targetLang;
        try {
          this.recognition.stop();
        } catch (e) {}
      }
    }
  }

  start(direction, onInterim, onFinal, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('ブラウザの音声認識 (Web Speech API) が利用できません。');
    }

    this.direction = direction;
    this.onInterimCallback = onInterim;
    this.onFinalCallback = onFinal;
    this.onErrorCallback = onError;
    this.isPaused = false;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    if (this.direction === 'en-to-ja') {
      this.recognition.lang = 'en-US';
    } else {
      this.recognition.lang = 'ja-JP';
    }

    this.recognition.onresult = (event) => {
      if (this.isPaused) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const finalTranscript = item[0].transcript.trim();
          if (finalTranscript.length > 0 && this.onFinalCallback) {
            const hasJa = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(finalTranscript);
            const detectedLang = hasJa ? 'ja' : (this.recognition.lang.startsWith('ja') ? 'ja' : 'en');
            this.onFinalCallback(finalTranscript, detectedLang);
          }
        } else {
          interim += item[0].transcript;
        }
      }
      if (interim && this.onInterimCallback) {
        this.onInterimCallback(interim);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[WebSpeech] Error:', event.error);
      if (event.error === 'not-allowed') {
        if (this.onErrorCallback) this.onErrorCallback(new Error('マイクの使用が許可されていません。'));
      }
    };

    this.recognition.onend = () => {
      if (this.isListening && !this.isPaused) {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    };

    this.recognition.start();
    this.isListening = true;
  }

  pause() {
    this.isPaused = true;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  resume() {
    this.isPaused = false;
    if (this.isListening && this.recognition) {
      try { this.recognition.start(); } catch (e) {}
    }
  }

  stop() {
    this.isListening = false;
    this.isPaused = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
  }
}

// ==========================================
// 4. Gemini Live WebSocket Client (with Session Resumption)
// ==========================================
class GeminiLiveClient {
  static WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  static SESSION_RECONNECT_INTERVAL = 570000;

  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.direction = 'auto';
    this.modelName = 'models/gemini-3.5-transcribe-live';
    this.isConnected = false;
    this.isSetupComplete = false;
    this.isReconnecting = false;
    this.chunkQueue = [];

    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;
    this._sessionTimer = null;

    // Callbacks
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onStatusChangeCallback = null;
    this.onErrorCallback = null;
    this.onDisconnectCallback = null;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[GeminiLive] ${message}`);
    }
  }

  setDirection(direction) {
    this.direction = direction;
    this.log('info', `Gemini Live 認識言語設定を更新: ${direction}`);
  }

  _normalizeModelName(model) {
    if (!model) return 'models/gemini-3.5-transcribe-live';
    return model.startsWith('models/') ? model : `models/${model}`;
  }

  connect(apiKey, direction, modelName) {
    return new Promise((resolve, reject) => {
      this.apiKey = apiKey;
      this.direction = direction;
      this.modelName = this._normalizeModelName(modelName);
      this.isSetupComplete = false;
      this.isConnected = false;
      this.chunkQueue = [];

      this._connectResolve = resolve;
      this._connectReject = reject;

      if (!apiKey) {
        return reject(new Error('Gemini API キーが未設定です。'));
      }

      const url = `${GeminiLiveClient.WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
      this.log('info', `WebSocket接続開始: ${this.modelName}`);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        this.log('error', `WebSocket作成失敗: ${err.message}`);
        return reject(new Error(`WebSocket初期化エラー: ${err.message}`));
      }

      this._connectTimeout = setTimeout(() => {
        if (!this.isSetupComplete) {
          const timeoutErr = new Error('Gemini Live API への接続がタイムアウトしました。');
          this.log('warn', '接続タイムアウト (10秒)');
          this.disconnect();
          reject(timeoutErr);
        }
      }, 10000);

      this.ws.onopen = () => {
        this.log('info', 'WebSocket接続オープン。Setup送信中...');
        this._sendSetupMessage();
      };

      this.ws.onmessage = async (event) => {
        let raw = event.data;
        if (event.data instanceof Blob) {
          raw = await event.data.text();
        }
        this._handleServerMessage(raw);
      };

      this.ws.onerror = (event) => {
        this.log('error', 'WebSocketエラーが発生しました。');
        this._cleanupTimeout();
        if (this._connectReject) {
          this._connectReject(new Error('Gemini Live API への接続に失敗しました。'));
          this._connectReject = null;
        }
      };

      this.ws.onclose = (event) => {
        this.log('warn', `WebSocket切断: Code ${event.code}`);
        this._cleanupTimeout();
        this._clearSessionTimer();

        const wasConnected = this.isConnected && this.isSetupComplete;
        this.isConnected = false;
        this.isSetupComplete = false;

        if (this._connectReject) {
          let errorMsg = `接続が切断されました (Code: ${event.code})`;
          if (event.code === 1006) {
            errorMsg = `Gemini Live APIに接続できませんでした (Code: 1006)。APIキーまたはモデル権限を確認してください。`;
          } else if (event.code === 1007 || event.code === 1008) {
            errorMsg = `認証またはリクエスト形式エラーです (Code: ${event.code})`;
          }
          this._connectReject(new Error(errorMsg));
          this._connectReject = null;
        } else if (wasConnected && !this.isReconnecting && this.onDisconnectCallback) {
          this.onDisconnectCallback(event.code, event.reason);
        }
      };
    });
  }

  _cleanupTimeout() {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
  }

  _clearSessionTimer() {
    if (this._sessionTimer) {
      clearTimeout(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  _startSessionResumptionTimer() {
    this._clearSessionTimer();
    this._sessionTimer = setTimeout(async () => {
      this.log('info', 'Gemini Live 10分セッション制限に伴う自動シームレス再接続を実行します...');
      try {
        await this._seamlessReconnect();
        this.log('success', 'シームレス再接続完了。セッションが継続更新されました。');
      } catch (err) {
        this.log('warn', `セッション更新失敗: ${err.message}`);
      }
    }, GeminiLiveClient.SESSION_RECONNECT_INTERVAL);
  }

  async _seamlessReconnect() {
    if (!this.isConnected || !this.ws) return;
    this.isReconnecting = true;
    try {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.ws.close();
    } catch (e) {}

    try {
      await this.connect(this.apiKey, this.direction, this.modelName);
      this.isReconnecting = false;
    } catch (err) {
      this.isReconnecting = false;
      throw err;
    }
  }

  disconnect() {
    this._cleanupTimeout();
    this._clearSessionTimer();
    this.isReconnecting = false;
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        } catch (e) {}
      }
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];
  }

  sendAudioChunk(base64Pcm) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!this.isSetupComplete) {
      this.chunkQueue.push(base64Pcm);
      return;
    }

    while (this.chunkQueue.length > 0) {
      const qChunk = this.chunkQueue.shift();
      this._dispatchChunk(qChunk);
    }

    this._dispatchChunk(base64Pcm);
  }

  _dispatchChunk(base64Data) {
    const payload = {
      realtimeInput: {
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm;rate=16000'
        }
      }
    };
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to send audio chunk:', e);
    }
  }

  _sendSetupMessage() {
    let languageCodes = [];
    if (this.direction === 'ja-to-en') {
      languageCodes = ['ja-JP'];
    } else if (this.direction === 'en-to-ja') {
      languageCodes = ['en-US'];
    } else {
      languageCodes = [];
    }

    const setupPayload = {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ['TEXT']
        },
        inputAudioTranscription: {
          languageCodes: languageCodes
        }
      }
    };

    this.log('info', `Setup送信: ${JSON.stringify(setupPayload)}`);
    this.ws.send(JSON.stringify(setupPayload));
  }

  _handleServerMessage(rawMessage) {
    try {
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (data.setupComplete) {
        this.log('success', 'SetupComplete 受信。音声認識ストリーム準備完了。');
        this.isConnected = true;
        this.isSetupComplete = true;
        this._cleanupTimeout();
        this._startSessionResumptionTimer();

        if (this._connectResolve) {
          this._connectResolve();
          this._connectResolve = null;
          this._connectReject = null;
        }

        while (this.chunkQueue.length > 0) {
          const qChunk = this.chunkQueue.shift();
          this._dispatchChunk(qChunk);
        }
        return;
      }

      if (data.serverContent) {
        const sc = data.serverContent;
        const interimObj = sc.interimInputTranscription || sc.interim_input_transcription;
        if (interimObj && interimObj.text) {
          if (this.onInterimCallback) {
            this.onInterimCallback(interimObj.text);
          }
        }

        const finalObj = sc.inputTranscription || sc.input_transcription;
        if (finalObj && finalObj.text) {
          const finalText = finalObj.text.trim();
          const langCode = finalObj.languageCode || null;
          this.log('info', `確定音声認識: "${finalText}"`);
          if (finalText.length > 0 && this.onFinalCallback) {
            this.onFinalCallback(finalText, langCode);
          }
        }
      }
    } catch (e) {
      console.warn('Server message parse error:', e);
    }
  }
}

// ==========================================
// [FIX 1] Shared fetch with AbortController timeout
// 1件のハングでキュー全体が永久停止するのを防止する共通ユーティリティ
// ==========================================
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ==========================================
// 5. Translation Service & 3-Layer Resilient Queue
// ==========================================
class TranslationService {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.onLogCallback = null;
    // [FIX 4] 直近で成功したモデルを記憶し、次回はそこから試行して無駄往復を削減
    this._preferredModel = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Translation] ${message}`);
    }
  }

  enqueue(text, direction, category, apiKey, gasUrl, gasToken, recordId, onComplete) {
    this.queue.push({ text, direction, category, apiKey, gasUrl, gasToken, recordId, onComplete });
    this._processNext();
  }

  async _processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift();
    try {
      const result = await this._executeTranslation(job);
      if (job.onComplete) {
        job.onComplete(job.recordId, result);
      }
    } catch (err) {
      this.log('error', `翻訳ジョブ致命的エラー: ${err.message}`);
      if (job.onComplete) {
        job.onComplete(job.recordId, { translated: '【翻訳エラー / 再試行可能】', speakerLang: 'auto' });
      }
    } finally {
      this.isProcessing = false;
      this._processNext();
    }
  }

  async _executeTranslation({ text, direction, category, apiKey, gasUrl, gasToken }) {
    if (!text || text.trim() === '') return { translated: '', speakerLang: 'ja' };

    let srcLang = 'ja';
    let targetLang = 'en';

    if (direction === 'ja-to-en') {
      srcLang = 'ja';
      targetLang = 'en';
    } else if (direction === 'en-to-ja') {
      srcLang = 'en';
      targetLang = 'ja';
    } else {
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
      srcLang = hasJapanese ? 'ja' : 'en';
      targetLang = hasJapanese ? 'en' : 'ja';
    }

    const domainHint = category ? ` Domain context: Maritime Ship Recycling / Safety Audit (${category}). Use accurate technical terminology.` : '';
    const prompt = `You are a professional simultaneous interpreter specializing in maritime audit and safety.${domainHint}\n`
                 + `Translate the following text from ${srcLang === 'ja' ? 'Japanese' : 'English'} into fluent, accurate ${targetLang === 'ja' ? 'Japanese' : 'English'}.\n`
                 + `Strict requirements:\n`
                 + `1. Return ONLY the direct translation.\n`
                 + `2. Do not include quotes, explanations, prefixes, or notes.\n\n`
                 + `Text:\n${text}`;

    // Layer 1: Gemini REST API (Cascade Fallback)
    if (apiKey && apiKey.trim() !== '') {
      const baseModels = [
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash'
      ];
      // [FIX 4] 前回成功したモデルを先頭に置き、以降の発話は原則1往復で確定させる
      const modelsToTry = this._preferredModel
        ? [this._preferredModel, ...baseModels.filter((m) => m !== this._preferredModel)]
        : baseModels;

      for (const modelName of modelsToTry) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
        try {
          // [FIX 1] タイムアウト付きfetchでハングによるキュー全停止を防止
          const res = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 800
              }
            })
          }, 12000);

          if (res.ok) {
            const data = await res.json();
            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
              const transText = data.candidates[0].content.parts[0].text.trim();
              // [FIX 4] 成功モデルを記憶
              this._preferredModel = modelName;
              this.log('success', `Gemini (${modelName}) 翻訳完了: "${transText}"`);
              return {
                translated: transText,
                speakerLang: srcLang
              };
            }
          } else {
            const errData = await res.json().catch(() => null);
            const errDetail = errData?.error?.message || `HTTP ${res.status}`;
            // [FIX 4] 記憶していたモデルが失敗したら記憶を破棄し、次回は先頭から再評価
            if (this._preferredModel === modelName) this._preferredModel = null;
            this.log('warn', `Gemini (${modelName}) 失敗: ${errDetail}`);
          }
        } catch (err) {
          if (this._preferredModel === modelName) this._preferredModel = null;
          const reason = err.name === 'AbortError' ? 'タイムアウト (12秒)' : err.message;
          this.log('warn', `Gemini (${modelName}) 通信エラー: ${reason}`);
        }
      }
    } else {
      this.log('warn', 'Gemini APIキーが未入力のため、GASバックアップ翻訳を試行します。');
    }

    // Layer 2: GAS Web App (LanguageApp) Fallback
    if (gasUrl && gasUrl.trim() !== '') {
      this.log('info', 'GAS (LanguageApp) による自動フォールバック翻訳を実行中...');
      try {
        // [FIX 1] GASフォールバックにもタイムアウトを付与
        const gasRes = await fetchWithTimeout(gasUrl.trim(), {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'translate',
            token: gasToken || '',
            text: text,
            srcLang: srcLang,
            targetLang: targetLang
          })
        }, 15000);

        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.status === 'success' && gasData.translated) {
            this.log('success', `GAS翻訳完了: "${gasData.translated}"`);
            return {
              translated: gasData.translated.trim(),
              speakerLang: srcLang
            };
          } else if (gasData.message) {
            this.log('warn', `GAS翻訳応答エラー: ${gasData.message}`);
          }
        } else {
          this.log('warn', `GAS翻訳通信エラー: HTTP ${gasRes.status}`);
        }
      } catch (gasErr) {
        const gasReason = gasErr.name === 'AbortError' ? 'タイムアウト (15秒)' : gasErr.message;
        this.log('warn', `GAS翻訳接続失敗: ${gasReason}`);
      }
    }

    return {
      translated: '【翻訳取得失敗: APIキーまたはGAS設定を確認してください】',
      speakerLang: srcLang
    };
  }
}

// ==========================================
// 6. GAS Storage Client (Google Docs Integration)
// ==========================================
class GasStorageClient {
  static extractFolderId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return (match && match[1]) ? match[1] : String(input).trim();
  }

  static extractDocId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return (match && match[1]) ? match[1] : String(input).trim();
  }

  static async ping(gasUrl, token) {
    if (!gasUrl) throw new Error('GAS Web App URLが設定されていません。');
    
    // Check URL structure first
    const trimmedUrl = gasUrl.trim();
    if (!trimmedUrl.startsWith('https://script.google.com/')) {
      throw new Error('GAS Web App URLは "https://script.google.com/..." で始まる必要があります。');
    }
    if (trimmedUrl.endsWith('/edit')) {
      throw new Error('GASエディタの編集URLが設定されています。「デプロイ」→「ウェブアプリ」で発行されたURL (.../exec) を設定してください。');
    }

    try {
      // [FIX 1] 疎通テストにもタイムアウトを付与し、無応答時にUIが固まらないようにする
      const res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'ping', token: token || '' })
      }, 12000);

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (jsonErr) {
        if (rawText.includes('<html') || rawText.includes('<!DOCTYPE') || rawText.includes('accounts.google.com')) {
          throw new Error('Googleのログイン画面が返却されました。GASのデプロイ設定で「アクセスできるユーザー」を「全員 (Anyone)」に設定してください。');
        }
        throw new Error(`JSONパース失敗: ${rawText.slice(0, 80)}`);
      }

      if (data.status === 'error') {
        throw new Error(data.message || 'GASエラー');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('GASサーバーが12秒以内に応答しませんでした（タイムアウト）。URLとデプロイ状態を確認してください。');
      }
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('GASサーバーに接続できません (CORS/ネットワークエラー)。デプロイ設定で「アクセスできるユーザー: 全員」になっているか、URLが有効か確認してください。');
      }
      throw err;
    }
  }

  static async saveTranscript(gasUrl, { documentId, title, folderId, records, direction, category, model, token }) {
    if (!gasUrl) throw new Error('GAS Web App URLが未設定です。');
    if (!records || records.length === 0) throw new Error('保存対象の差分レコードがありません。');

    const trimmedUrl = gasUrl.trim();
    if (trimmedUrl.endsWith('/edit')) {
      throw new Error('GASエディタの編集URLが設定されています。「デプロイ」→「ウェブアプリ」で発行されたURL (.../exec) を設定してください。');
    }

    const sanitizedDocId = GasStorageClient.extractDocId(documentId);
    const payload = {
      action: 'save',
      token: token || '',
      documentId: sanitizedDocId,
      title: title || '',
      folderId: GasStorageClient.extractFolderId(folderId),
      outputFolderId: GasStorageClient.extractFolderId(folderId),
      model: model || 'models/gemini-3.5-transcribe-live',
      direction: direction || 'AUTO',
      category: category || 'HKC',
      records: records
    };

    let res;
    try {
      // [FIX 1] 保存処理は本文が大きくなり得るため、やや長め(20秒)のタイムアウトを付与
      res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      }, 20000);
    } catch (netErr) {
      if (netErr.name === 'AbortError') {
        throw new Error('GAS保存が20秒以内に完了しませんでした（タイムアウト）。件数が多い場合は分割保存をお試しください。');
      }
      throw new Error('GASサーバーと通信できませんでした (CORSまたは接続遮断)。GASのデプロイで「アクセスできるユーザー: 全員」が設定されているか確認してください。');
    }

    if (!res.ok) {
      throw new Error(`GAS通信HTTPエラー: ${res.status}`);
    }

    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (jsonErr) {
      if (rawText.includes('<html') || rawText.includes('<!DOCTYPE') || rawText.includes('accounts.google.com')) {
        throw new Error('Googleのログイン画面に転送されました。GASのデプロイ設定で「アクセスできるユーザー」が「全員」になっているか確認してください。');
      }
      throw new Error(`GAS応答の解析失敗: ${rawText.slice(0, 100)}`);
    }

    if (data.status === 'error') {
      throw new Error(data.message || 'GAS処理エラー');
    }
    return data;
  }
}

// ==========================================
// 7. Main Application Controller
// ==========================================
class App {
  constructor() {
    this.audioService = new AudioCaptureService();
    this.webSpeechService = new WebSpeechService();
    this.geminiClient = new GeminiLiveClient();
    this.translationService = new TranslationService();
    this.translationService.onLogCallback = (type, msg) => this.log(type, msg);

    this.activeEngine = 'none';
    this.records = [];
    this.lastSavedIndex = 0;
    this.isRecording = false;
    this.isPaused = false;

    this._initElements();
    this._loadSettings();
    this._bindEvents();
    this._checkHashConfig();
    this._updateUIState();

    this.log('info', '初期化完了 (v2.5.0)。2カラム対面監査UI・インライン編集機能が有効です。');
  }

  log(type, message) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${time}] ${message}`;
    this.elDiagLog.appendChild(line);
    this.elDiagLogContainer.scrollTop = this.elDiagLogContainer.scrollHeight;
  }

  _initElements() {
    this.elStatusBadge = document.getElementById('connection-status');
    this.elStatusText = document.getElementById('status-text');
    this.elEngineBadge = document.getElementById('active-engine-badge');
    this.elBtnSettings = document.getElementById('btn-open-settings');

    this.elBtnToggleRecord = document.getElementById('btn-toggle-record');
    this.elBtnPauseRecord = document.getElementById('btn-pause-record');
    this.elSelectDirection = document.getElementById('select-direction');
    this.elSelectCategory = document.getElementById('select-category');
    this.elSelectGain = document.getElementById('select-gain');
    this.elSelectDefaultGain = document.getElementById('select-default-gain');
    this.elBtnClearFeed = document.getElementById('btn-clear-feed');
    this.elBtnSaveDocs = document.getElementById('btn-save-docs');
    this.elSaveDocsText = document.getElementById('btn-save-docs-text');
    this.elUnsavedBadge = document.getElementById('unsaved-badge');

    this.elRadioDocModes = document.getElementsByName('doc-save-mode');
    this.elInputDocTitle = document.getElementById('input-doc-title');
    this.elInputDocId = document.getElementById('input-doc-id');
    this.elInputFolderId = document.getElementById('input-folder-id');
    this.elInputDefaultFolderId = document.getElementById('input-default-folder-id');
    this.elSavedFolderSep = document.getElementById('saved-folder-sep');
    this.elSavedFolderLink = document.getElementById('saved-folder-link');
    this.elSavedDocBanner = document.getElementById('saved-doc-banner');
    this.elSavedDocLink = document.getElementById('saved-doc-link');

    // Live Preview elements (matching b9abbcfb.html)
    this.elLivePreview = document.getElementById('livePreview');
    this.elLiveText = document.getElementById('liveText');
    this.elLiveEngineTag = document.getElementById('liveEngineTag');
    this.elMeterBar = document.querySelector('.meter-bar');

    this.elToggleDiag = document.getElementById('toggle-diag');
    this.elDiagLogContainer = document.getElementById('diag-log-container');
    this.elDiagLog = document.getElementById('diag-log');

    this.elTranscriptList = document.getElementById('transcript-list');
    this.elEmptyState = document.getElementById('empty-state');
    this.elRecordCount = document.getElementById('record-count');
    this.elBtnCopyAll = document.getElementById('btn-copy-all');

    // Modal
    this.elModal = document.getElementById('settings-modal');
    this.elBtnCloseModal = document.getElementById('btn-close-modal');
    this.elInputApiKey = document.getElementById('input-gemini-key');
    this.elBtnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
    this.elSelectEngineMode = document.getElementById('select-engine-mode');
    this.elSelectLiveModel = document.getElementById('select-live-model');
    this.elInputGasUrl = document.getElementById('input-gas-url');
    this.elInputGasToken = document.getElementById('input-gas-token');
    this.elBtnTestGas = document.getElementById('btn-test-gas');
    this.elGasTestResult = document.getElementById('gas-test-result');
    this.elCheckAutoSave = document.getElementById('check-auto-save');
    this.elBtnSaveSettings = document.getElementById('btn-save-settings');

    this.elToastContainer = document.getElementById('toast-container');

    // QR Code Modal elements
    this.elBtnOpenQr = document.getElementById('btn-open-qr');
    this.elQrModal = document.getElementById('qr-modal');
    this.elBtnCloseQrModal = document.getElementById('btn-close-qr-modal');
    this.elBtnDoneQrModal = document.getElementById('btn-done-qr-modal');
    this.elQrCanvas = document.getElementById('qr-canvas');
    this.elInputShareUrl = document.getElementById('input-share-url');
    this.elBtnCopyShareUrl = document.getElementById('btn-copy-share-url');
  }

  _loadSettings() {
    this.apiKey = ConfigManager.get(ConfigManager.STORAGE_KEYS.API_KEY, '');
    this.gasUrl = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAS_URL, '');
    this.gasToken = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAS_TOKEN, '');
    this.direction = ConfigManager.get(ConfigManager.STORAGE_KEYS.DIRECTION, 'auto');
    this.category = ConfigManager.get(ConfigManager.STORAGE_KEYS.CATEGORY, 'HKC');
    this.gain = ConfigManager.get(ConfigManager.STORAGE_KEYS.GAIN, '2.5');
    this.engineMode = ConfigManager.get(ConfigManager.STORAGE_KEYS.ENGINE_MODE, 'auto');
    this.liveModel = ConfigManager.get(ConfigManager.STORAGE_KEYS.LIVE_MODEL, 'models/gemini-3.5-transcribe-live');
    this.autoSave = ConfigManager.get(ConfigManager.STORAGE_KEYS.AUTO_SAVE, 'false') === 'true';
    this.docMode = ConfigManager.get(ConfigManager.STORAGE_KEYS.DOC_MODE, 'new');
    this.folderId = ConfigManager.get(ConfigManager.STORAGE_KEYS.FOLDER_ID, '15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f');
    if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
    if (this.elInputDefaultFolderId) this.elInputDefaultFolderId.value = this.folderId;
    this.lastDocId = ConfigManager.get(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, '');

    this.elInputApiKey.value = this.apiKey;
    this.elInputGasUrl.value = this.gasUrl;
    this.elInputGasToken.value = this.gasToken;
    this.elSelectDirection.value = this.direction;
    if (this.elSelectCategory) this.elSelectCategory.value = this.category;
    if (this.elSelectGain) this.elSelectGain.value = this.gain;
    if (this.elSelectDefaultGain) this.elSelectDefaultGain.value = this.gain;
    this.audioService.setGain(this.gain);
    this.elSelectEngineMode.value = this.engineMode;
    this.elSelectLiveModel.value = this.liveModel;
    this.elCheckAutoSave.checked = this.autoSave;

    if (this.lastDocId) {
      this.elInputDocId.value = this.lastDocId;
    }

    for (const radio of this.elRadioDocModes) {
      if (radio.value === this.docMode) radio.checked = true;
    }
    this._syncDocModeUI();
  }

  _bindEvents() {
    this.elBtnToggleRecord.addEventListener('click', () => this.toggleRecording());
    this.elBtnPauseRecord.addEventListener('click', () => this.togglePause());

    this.elSelectDirection.addEventListener('change', (e) => {
      this.direction = e.target.value;
      ConfigManager.set(ConfigManager.STORAGE_KEYS.DIRECTION, this.direction);
      this.geminiClient.setDirection(this.direction);
      this.webSpeechService.setDirection(this.direction);
      this.log('info', `翻訳方向変更: ${this.direction}`);
      if (this.isRecording) {
        this.showToast('翻訳方向が変更されました。次回発話から適用されます。', 'info');
      }
    });

    if (this.elSelectCategory) {
      this.elSelectCategory.addEventListener('change', (e) => {
        this.category = e.target.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.CATEGORY, this.category);
        this.log('info', `監査分野変更: ${this.category}`);
      });
    }

    if (this.elSelectGain) {
      this.elSelectGain.addEventListener('change', (e) => {
        this.gain = e.target.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.GAIN, this.gain);
        this.audioService.setGain(this.gain);
        this.log('info', `マイク集音感度変更: ${this.gain}x (遠距離ブースト適用)`);
        this.showToast(`マイク感度を ${this.gain}x に設定しました。`, 'info');
      });
    }

    this.elBtnClearFeed.addEventListener('click', () => {
      if (this.records.length === 0) return;
      if (confirm('タイムラインの翻訳履歴を全消去しますか？')) {
        this.records = [];
        this.lastSavedIndex = 0;
        this.elTranscriptList.innerHTML = '';
        this.elEmptyState.style.display = 'block';
        this.elRecordCount.textContent = '0 件の発話';
        this._updateUIState();
        this.showToast('全履歴をクリアしました。', 'info');
      }
    });

    this.elBtnSaveDocs.addEventListener('click', () => this.saveToDocs(false));

    for (const radio of this.elRadioDocModes) {
      radio.addEventListener('change', (e) => {
        this.docMode = e.target.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, this.docMode);
        this._syncDocModeUI();
      });
    }

    this.elInputDocId.addEventListener('input', (e) => {
      const sanitized = GasStorageClient.extractDocId(e.target.value);
      if (sanitized !== e.target.value) {
        e.target.value = sanitized;
      }
    });

    this.elBtnCopyAll.addEventListener('click', () => this.copyAllTranscripts());

    this.elToggleDiag.addEventListener('click', () => {
      const isHidden = this.elDiagLogContainer.style.display === 'none';
      this.elDiagLogContainer.style.display = isHidden ? 'block' : 'none';
    });

    // Modal
    this.elBtnSettings.addEventListener('click', () => {
      this.elModal.style.display = 'flex';
      this.elInputApiKey.focus();
    });
    this.elBtnCloseModal.addEventListener('click', () => {
      this.elModal.style.display = 'none';
    });
    this.elModal.addEventListener('click', (e) => {
      if (e.target === this.elModal) this.elModal.style.display = 'none';
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elModal.style.display === 'flex') {
        this.elModal.style.display = 'none';
      }
    });

    this.elBtnToggleKeyVis.addEventListener('click', () => {
      if (this.elInputApiKey.type === 'password') {
        this.elInputApiKey.type = 'text';
        this.elBtnToggleKeyVis.textContent = '非表示';
      } else {
        this.elInputApiKey.type = 'password';
        this.elBtnToggleKeyVis.textContent = '表示';
      }
    });

    this.elBtnSaveSettings.addEventListener('click', () => {
      this.apiKey = this.elInputApiKey.value.trim();
      this.gasUrl = this.elInputGasUrl.value.trim();
      this.gasToken = this.elInputGasToken.value.trim();
      this.engineMode = this.elSelectEngineMode.value;
      if (this.elSelectDefaultGain) {
        this.gain = this.elSelectDefaultGain.value;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.GAIN, this.gain);
        if (this.elSelectGain) this.elSelectGain.value = this.gain;
        this.audioService.setGain(this.gain);
      }
      this.liveModel = this.elSelectLiveModel.value;
      if (this.elInputDefaultFolderId) {
        this.folderId = GasStorageClient.extractFolderId(this.elInputDefaultFolderId.value.trim()) || '15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f';
        ConfigManager.set(ConfigManager.STORAGE_KEYS.FOLDER_ID, this.folderId);
        if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
      }
      this.autoSave = this.elCheckAutoSave.checked;

      ConfigManager.set(ConfigManager.STORAGE_KEYS.API_KEY, this.apiKey);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_URL, this.gasUrl);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_TOKEN, this.gasToken);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.ENGINE_MODE, this.engineMode);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.LIVE_MODEL, this.liveModel);
      ConfigManager.set(ConfigManager.STORAGE_KEYS.AUTO_SAVE, String(this.autoSave));

      this.elModal.style.display = 'none';
      this.log('info', `設定保存: エンジン=${this.engineMode}, モデル=${this.liveModel}`);
      this.showToast('設定を保存しました。', 'success');
    });

    this.elBtnTestGas.addEventListener('click', async () => {
      const url = this.elInputGasUrl.value.trim();
      if (!url) {
        this.elGasTestResult.textContent = 'URLを入力してください';
        this.elGasTestResult.className = 'test-result-text error';
        return;
      }
      this.elGasTestResult.textContent = '通信テスト中...';
      this.elGasTestResult.className = 'test-result-text';
      try {
        const res = await GasStorageClient.ping(url, this.elInputGasToken.value.trim());
        if (res.status === 'ok' || res.status === 'success') {
          const authNote = res.authRequired ? ' (認証保護あり)' : '';
          this.elGasTestResult.textContent = `✓ 接続成功 (v${res.version || '2.5.0'})${authNote}`;
          this.elGasTestResult.className = 'test-result-text success';
          this.log('success', `GAS Web App 疎通確認完了: ${url}`);
        } else {
          this.elGasTestResult.textContent = res.message || '応答受信 (エラーあり)';
          this.elGasTestResult.className = 'test-result-text error';
        }
      } catch (err) {
        this.elGasTestResult.textContent = '接続失敗: ' + err.message;
        this.elGasTestResult.className = 'test-result-text error';
        this.log('error', `GAS疎通失敗: ${err.message}`);
      }
    });

    // Gemini Client Callbacks
    this.geminiClient.onLogCallback = (type, msg) => this.log(type, msg);
    this.geminiClient.onStatusChangeCallback = (status) => this._updateStatus(status);
    this.geminiClient.onErrorCallback = (err) => this.showToast(err, 'error');
    this.geminiClient.onDisconnectCallback = (code, reason) => {
      this.log('warn', `セッション終了切断: Code ${code}`);
      this.stopRecording();
    };
    this.geminiClient.onInterimCallback = (text) => this._renderInterim(text);
    this.geminiClient.onFinalCallback = (finalText, langCode) => this._handleFinalSpeech(finalText, langCode);

    // QR Modal Events
    if (this.elBtnOpenQr) {
      this.elBtnOpenQr.addEventListener('click', () => this._openQrModal());
    }
    if (this.elBtnCloseQrModal) {
      this.elBtnCloseQrModal.addEventListener('click', () => {
        this.elQrModal.style.display = 'none';
      });
    }
    if (this.elBtnDoneQrModal) {
      this.elBtnDoneQrModal.addEventListener('click', () => {
        this.elQrModal.style.display = 'none';
      });
    }
    if (this.elQrModal) {
      this.elQrModal.addEventListener('click', (e) => {
        if (e.target === this.elQrModal) this.elQrModal.style.display = 'none';
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elQrModal && this.elQrModal.style.display === 'flex') {
        this.elQrModal.style.display = 'none';
      }
    });
    if (this.elBtnCopyShareUrl) {
      this.elBtnCopyShareUrl.addEventListener('click', () => {
        if (this.elInputShareUrl.value) {
          navigator.clipboard.writeText(this.elInputShareUrl.value).then(() => {
            this.showToast('スマホ連携用URLをクリップボードにコピーしました。', 'info');
          });
        }
      });
    }
  }

  _syncDocModeUI() {
    if (this.docMode === 'existing') {
      this.elInputDocTitle.style.display = 'none';
      if (this.elInputFolderId) this.elInputFolderId.style.display = 'none';
      this.elInputDocId.style.display = 'block';
    } else {
      this.elInputDocTitle.style.display = 'block';
      if (this.elInputFolderId) this.elInputFolderId.style.display = 'block';
      this.elInputDocId.style.display = 'none';
    }
  }

  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (window.location.protocol === 'file:') {
      this.log('error', 'file:// プロトコルではブラウザのマイク機能が無効化されます。HTTPS または http://localhost 上でアクセスしてください。');
      this.showToast('file:// ではマイクが動作しません。ローカルサーバーまたはGitHub Pagesで開いてください。', 'error');
      return;
    }

    if (!this.apiKey) {
      this.showToast('Gemini API キーを設定してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    this.log('info', `=== 翻訳セッション開始 (モード: ${this.engineMode}) ===`);

    try {
      this._updateStatus('connecting');
      let liveConnected = false;

      if (this.engineMode === 'auto' || this.engineMode === 'gemini-live') {
        try {
          this.log('info', 'Gemini Live WebSocket へ接続試行中...');
          await this.geminiClient.connect(this.apiKey, this.direction, this.liveModel);

          this.log('info', 'マイク音声取得開始 (Anti-Aliased 16kHz)...');
          await this.audioService.start(
            (chunk) => this.geminiClient.sendAudioChunk(chunk),
            (volume) => this._updateMeter(volume)
          );

          this.activeEngine = 'gemini-live';
          this.elEngineBadge.textContent = 'Gemini Live';
          this.elLiveEngineTag.textContent = 'Gemini Live';
          liveConnected = true;
          this.log('success', 'Gemini Live WebSocket 音声認識がアクティブになりました。');
        } catch (liveErr) {
          this.log('warn', `Gemini Live 接続失敗: ${liveErr.message}`);
          try { this.audioService.stop(); } catch (e) {}
          try { this.geminiClient.disconnect(); } catch (e) {}

          if (this.engineMode === 'gemini-live') {
            throw liveErr;
          }
          this.log('info', '自動フォールバック: ブラウザ標準音声認識 (Web Speech API) を起動します...');
        }
      }

      if (!liveConnected) {
        if (!this.webSpeechService.isSupported()) {
          throw new Error('ブラウザの音声認識APIが利用できません。Chrome または Edge でアクセスしてください。');
        }

        this.webSpeechService.start(
          this.direction,
          (interim) => this._renderInterim(interim),
          (finalText, lang) => this._handleFinalSpeech(finalText, lang),
          (err) => {
            this.log('error', `WebSpeechエラー: ${err.message}`);
            this.showToast(err.message, 'error');
          }
        );

        this.activeEngine = 'web-speech';
        this.elEngineBadge.textContent = 'Web Speech';
        this.elLiveEngineTag.textContent = 'Web Speech';
        this.log('success', 'ブラウザ標準音声認識 + Gemini翻訳パイプラインが起動しました。');
      }

      this.isRecording = true;
      this.isPaused = false;
      this.elLivePreview.style.display = 'flex';
      this._renderInterim('話しかけてください...');
      this._updateStatus('recording');
      this._updateUIState();
      this.showToast('音声認識と自動翻訳を開始しました。マイクに向かって話してください。', 'success');
    } catch (err) {
      console.error('Failed to start session:', err);
      this.log('error', `起動処理失敗: ${err.message}`);
      try { this.audioService.stop(); } catch (e) {}
      try { this.geminiClient.disconnect(); } catch (e) {}
      try { this.webSpeechService.stop(); } catch (e) {}
      this.isRecording = false;
      this.isPaused = false;
      this.activeEngine = 'none';
      this.elLivePreview.style.display = 'none';
      this._updateMeter(0);
      this._updateStatus('idle');
      this._updateUIState();
      this.showToast('開始エラー: ' + err.message, 'error');
    }
  }

  async stopRecording() {
    this.log('info', '翻訳セッションを停止中...');
    if (this.activeEngine === 'gemini-live') {
      try { this.audioService.stop(); } catch (e) {}
      try { this.geminiClient.disconnect(); } catch (e) {}
    } else if (this.activeEngine === 'web-speech') {
      try { this.webSpeechService.stop(); } catch (e) {}
    }

    this.isRecording = false;
    this.isPaused = false;
    this.activeEngine = 'none';
    this.elLivePreview.style.display = 'none';
    this._updateMeter(0);
    this._updateStatus('idle');
    this._updateUIState();
    this.log('info', 'セッション停止完了。');
    this.showToast('翻訳セッションを停止しました。', 'info');

    const unsavedCount = this.records.length - this.lastSavedIndex;
    if (this.autoSave && unsavedCount > 0 && this.gasUrl) {
      await this.saveToDocs(true);
    }
  }

  togglePause() {
    if (!this.isRecording) return;
    if (this.isPaused) {
      if (this.activeEngine === 'gemini-live') {
        this.audioService.resume();
      } else if (this.activeEngine === 'web-speech') {
        this.webSpeechService.resume();
      }
      this.isPaused = false;
      this.elLivePreview.style.display = 'flex';
      this._renderInterim('翻訳を再開しました。話しかけてください...');
      this._updateStatus('recording');
      this.showToast('翻訳を再開しました。', 'info');
    } else {
      if (this.activeEngine === 'gemini-live') {
        this.audioService.pause();
      } else if (this.activeEngine === 'web-speech') {
        this.webSpeechService.pause();
      }
      this.isPaused = true;
      this._renderInterim('一時停止中 (音声を認識しません)');
      this._updateStatus('paused');
      this.showToast('翻訳を一時停止しました。', 'warning');
    }
    this._updateUIState();
  }

  _updateMeter(volume) {
    const pct = Math.min(100, Math.round(volume * 400));
    if (this.elMeterBar) {
      this.elMeterBar.style.width = `${pct}%`;
    }
  }

  _renderInterim(text) {
    if (!this.elLiveText) return;
    if (!text || text.trim() === '') {
      this.elLiveText.className = 'live-text live-placeholder';
      this.elLiveText.textContent = this.isRecording
        ? '話しかけてください...'
        : 'マイクを開始すると、リアルタイムの音声認識プレビューが表示されます...';
    } else {
      this.elLiveText.className = 'live-text';
      this.elLiveText.textContent = text;
    }
  }

  /**
   * 音声確定時: b9abbcfb.html のカード構造（2カラム原文/訳文・話者タグ・アクション完備）を生成
   */
  _handleFinalSpeech(finalText, langCode) {
    if (!finalText || finalText.trim() === '') return;

    this._renderInterim('話しかけてください...');

    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const recordId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 日本語判定に基づくデフォルト話者ロール（日本語はAuditor、英語はYard Rep）
    const hasJa = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(finalText);
    const initialSpeaker = hasJa ? ROLES[0] : ROLES[1];
    const engineLabel = this.activeEngine === 'gemini-live' ? 'Gemini Live' : 'Web Speech';

    const record = {
      id: recordId,
      time: timestamp,
      speaker: initialSpeaker,
      speakerLang: langCode || (hasJa ? 'ja' : 'en'),
      originalText: finalText,
      translatedText: '',
      engine: engineLabel,
      direction: this.direction,
      category: this.category,
      isTranslating: true
    };

    this.records.push(record);
    this._appendSingleCard(record);
    this._updateUIState();

    this.log('info', `確定発話をFIFOキューに投入: "${finalText}"`);

    this.translationService.enqueue(
      finalText,
      this.direction,
      this.category,
      this.apiKey,
      this.gasUrl,
      this.gasToken,
      recordId,
      (id, transResult) => this._onTranslationComplete(id, transResult)
    );
  }

  /**
   * b9abbcfb.html の card テンプレートと完全に同一の要素を構築
   */
  _appendSingleCard(item) {
    this.elEmptyState.style.display = 'none';
    this.elRecordCount.textContent = `${this.records.length} 件の発話`;

    const card = document.createElement('div');
    card.className = 'card transcript-item';
    card.id = item.id;

    const speakerClass = item.speaker?.includes('Auditor')
      ? 'auditor'
      : item.speaker?.includes('Yard')
      ? 'yard'
      : '';

    card.innerHTML = `
      <div class="meta">
        <div class="meta-left">
          <span>🕒 ${this._escapeHTML(item.time)}</span>
          <span id="${item.id}_spk" class="tag speaker ${speakerClass}" title="クリックで話者を変更">${this._escapeHTML(item.speaker || '発話')}</span>
          <span class="tag engine">${this._escapeHTML(item.engine || 'Gemini')}</span>
        </div>
        <div class="card-actions">
          <button class="small-btn" data-a="copy" title="このカード内容をコピー">📋</button>
          <button class="small-btn" data-a="edit" title="原文・訳文を修正">✏️</button>
          <button class="small-btn" data-a="retry" title="再翻訳を実行">🔄</button>
          <button class="small-btn" data-a="delete" title="この発話を削除">🗑️</button>
        </div>
      </div>
      <div id="${item.id}_view" class="body-grid">
        <div class="column">
          <span class="label">原文</span>
          <div id="${item.id}_orig" class="original">${this._escapeHTML(item.originalText)}</div>
        </div>
        <div class="column">
          <span class="label">訳文</span>
          <div id="${item.id}_trans" class="translation">${item.isTranslating ? '⏳ 翻訳中...' : this._escapeHTML(item.translatedText)}</div>
        </div>
      </div>
      <div id="${item.id}_edit" class="edit">
        <div class="edit-grid">
          <textarea id="${item.id}_edit_orig" placeholder="原文">${this._escapeHTML(item.originalText)}</textarea>
          <textarea id="${item.id}_edit_trans" placeholder="訳文">${this._escapeHTML(item.translatedText)}</textarea>
        </div>
        <div class="edit-actions">
          <button class="btn btn-sm btn-outline" data-a="cancel">キャンセル</button>
          <button class="btn btn-sm btn-primary" data-a="save">保存</button>
        </div>
      </div>
    `;

    // Event delegation for in-place actions
    card.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;

      // Copy Single Card
      if (a === 'copy') {
        const textToCopy = `[${item.time}] (${item.speaker})\n原文: ${item.originalText}\n訳文: ${item.translatedText || '(翻訳中...)'}`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          this.showToast('カード内容をコピーしました。', 'info');
        });
        return;
      }

      // Open Inline Edit
      if (a === 'edit') {
        document.getElementById(`${item.id}_view`).style.display = 'none';
        document.getElementById(`${item.id}_edit`).classList.add('open');
        return;
      }

      // Cancel Inline Edit
      if (a === 'cancel') {
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        return;
      }

      // Save Inline Edit
      if (a === 'save') {
        const editOrig = document.getElementById(`${item.id}_edit_orig`).value.trim();
        const editTrans = document.getElementById(`${item.id}_edit_trans`).value.trim();
        item.originalText = editOrig;
        item.translatedText = editTrans;
        document.getElementById(`${item.id}_orig`).textContent = editOrig;
        document.getElementById(`${item.id}_trans`).textContent = editTrans;
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        this.showToast('修正内容を保存しました。', 'success');
        return;
      }

      // Retry Translation
      if (a === 'retry') {
        item.isTranslating = true;
        document.getElementById(`${item.id}_trans`).textContent = '⏳ 再翻訳中...';
        this.translationService.enqueue(
          item.originalText,
          this.direction,
          this.category,
          this.apiKey,
          this.gasUrl,
          this.gasToken,
          item.id,
          (id, transResult) => this._onTranslationComplete(id, transResult)
        );
        this.showToast('再翻訳を開始しました。', 'info');
        return;
      }

      // Delete Record
      if (a === 'delete') {
        if (confirm('この発話をタイムラインから削除しますか？')) {
          this.records = this.records.filter((x) => x.id !== item.id);
          card.remove();
          this.elRecordCount.textContent = `${this.records.length} 件の発話`;
          if (this.records.length === 0) {
            this.elEmptyState.style.display = 'block';
          }
          this._updateUIState();
          this.showToast('発話を削除しました。', 'info');
        }
        return;
      }

      // Speaker Tag Click (Cycle Roles)
      if (e.target.id === `${item.id}_spk`) {
        let currIdx = ROLES.indexOf(item.speaker);
        item.speaker = ROLES[(currIdx + 1 + ROLES.length) % ROLES.length];
        e.target.textContent = item.speaker;

        e.target.className = 'tag speaker';
        if (item.speaker.includes('Auditor')) e.target.classList.add('auditor');
        else if (item.speaker.includes('Yard')) e.target.classList.add('yard');
      }
    });

    this.elTranscriptList.prepend(card);
  }

  _onTranslationComplete(recordId, transResult) {
    const record = this.records.find((r) => r.id === recordId);
    if (record) {
      record.translatedText = transResult.translated;
      record.speakerLang = transResult.speakerLang;
      record.isTranslating = false;
    }

    const transEl = document.getElementById(`${recordId}_trans`);
    if (transEl) {
      transEl.textContent = transResult.translated;
    }

    this.log('success', `翻訳反映完了: "${transResult.translated}"`);

    // Check auto-save threshold (every 10 unsaved items)
    const unsavedCount = this.records.length - this.lastSavedIndex;
    if (this.autoSave && unsavedCount >= 10 && this.gasUrl) {
      this.saveToDocs(true);
    }
  }

  async saveToDocs(isAuto = false) {
    if (!this.gasUrl) {
      if (!isAuto) {
        this.showToast('GAS Web App URLが未設定です。設定画面から登録してください。', 'warning');
        this.elModal.style.display = 'flex';
      }
      return;
    }

    // Wait for in-flight translations to finish (up to 5 seconds)
    if (this.translationService.isProcessing || this.translationService.queue.length > 0) {
      this.log('info', '未完了の翻訳ジョブの終了を待機しています...');
      let waitLimit = 0;
      while ((this.translationService.isProcessing || this.translationService.queue.length > 0) && waitLimit < 25) {
        await new Promise((r) => setTimeout(r, 200));
        waitLimit++;
      }
    }

    let eligibleCount = 0;
    for (let i = this.lastSavedIndex; i < this.records.length; i++) {
      if (this.records[i].isTranslating || !this.records[i].translatedText) {
        break;
      }
      eligibleCount++;
    }

    if (eligibleCount === 0) {
      if (!isAuto) {
        const hasPending = this.records.slice(this.lastSavedIndex).some(r => r.isTranslating);
        this.showToast(hasPending ? '現在翻訳処理中のため、完了後に保存してください。' : '新しく追加された未保存の差分はありません。', 'info');
      }
      return;
    }

    const unsavedRecords = this.records.slice(this.lastSavedIndex, this.lastSavedIndex + eligibleCount).map(r => ({
      timestamp: r.time,
      speaker: r.speaker,
      speakerLang: r.speakerLang,
      original: r.originalText,
      translated: r.translatedText,
      engine: r.engine
    }));

    const isExisting = this.docMode === 'existing';
    const rawDocId = isExisting ? this.elInputDocId.value.trim() : '';
    const docId = GasStorageClient.extractDocId(rawDocId);
    const title = this.elInputDocTitle.value.trim();

    if (isExisting && !docId) {
      this.showToast('追記先の既存ドキュメントIDを入力してください。', 'warning');
      this.elInputDocId.focus();
      return;
    }

    this.elBtnSaveDocs.disabled = true;
    this.elSaveDocsText.textContent = '差分保存中...';
    this.log('info', `Google ドキュメント差分同期開始 (保存対象: ${unsavedRecords.length}件)...`);

    try {
      const result = await GasStorageClient.saveTranscript(this.gasUrl, {
        token: this.gasToken,
        documentId: docId,
        title: title,
        records: unsavedRecords,
        direction: this.direction,
        category: this.category,
        model: this.liveModel
      });

      this.lastSavedIndex += eligibleCount;
      this._updateUIState();

      this.elSavedDocBanner.style.display = 'flex';
      this.elSavedDocLink.href = result.documentUrl;
      this.elSavedDocLink.textContent = `📄 ${result.documentTitle || 'ドキュメント'} を開く ↗`;
      if (result.folderUrl && this.elSavedFolderLink && this.elSavedFolderSep) {
        this.elSavedFolderSep.style.display = 'inline';
        this.elSavedFolderLink.style.display = 'inline';
        this.elSavedFolderLink.href = result.folderUrl;
        this.elSavedFolderLink.textContent = `📁 ${result.folderName || 'フォルダ'} ↗`;
      }
      this.log('success', `Google ドキュメント差分追記完了 (保存後累計: ${this.lastSavedIndex}件): ${result.documentUrl}`);

      if (result.documentId) {
        this.lastDocId = result.documentId;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, this.lastDocId);
        this.elInputDocId.value = this.lastDocId;
        
        this.docMode = 'existing';
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, 'existing');
        for (const radio of this.elRadioDocModes) {
          if (radio.value === 'existing') radio.checked = true;
        }
        this._syncDocModeUI();
      }

      this.showToast(
        isAuto ? `${unsavedRecords.length}件の差分を自動バックアップしました。` : `${unsavedRecords.length}件の差分をGoogleドキュメントに保存完了しました！`,
        'success'
      );
    } catch (err) {
      console.error('Save to Docs failed:', err);
      this.log('error', `GAS保存失敗: ${err.message}`);
      this.showToast('保存に失敗しました: ' + err.message, 'error');
    } finally {
      this.elBtnSaveDocs.disabled = false;
      this.elSaveDocsText.textContent = 'Google ドキュメントに保存';
      this._updateUIState();
    }
  }

  /**
   * b9abbcfb.html 仕様: 議事録Markdownテーブル形式で全コピー
   */
  copyAllTranscripts() {
    if (this.records.length === 0) {
      this.showToast('コピーする履歴がありません。', 'warning');
      return;
    }

    const clean = (s) => String(s || '').replace(/\n/g, '<br>').replace(/\|/g, '\\|');
    let md = `# 現地監査 議事録 (${this.category})\n\n`;
    md += `| 時刻 | 話者 | 原文 | 訳文 |\n|---|---|---|---|\n`;
    for (const t of this.records) {
      md += `| ${clean(t.time)} | ${clean(t.speaker)} | ${clean(t.originalText)} | ${clean(t.translatedText)} |\n`;
    }

    navigator.clipboard.writeText(md).then(() => {
      this.showToast('全履歴をMarkdown表形式でコピーしました。', 'info');
    });
  }

  _updateStatus(state) {
    this.elStatusBadge.className = 'status-badge';

    switch (state) {
      case 'recording':
        this.elStatusBadge.classList.add('status-recording');
        this.elStatusText.textContent = '録音中 (REC)';
        break;
      case 'connecting':
        this.elStatusBadge.classList.add('status-connecting');
        this.elStatusText.textContent = 'WS接続中...';
        break;
      case 'paused':
        this.elStatusBadge.classList.add('status-connecting');
        this.elStatusText.textContent = '一時停止中';
        break;
      case 'error':
        this.elStatusBadge.classList.add('status-error');
        this.elStatusText.textContent = 'エラー';
        break;
      case 'idle':
      default:
        this.elStatusBadge.classList.add('status-idle');
        this.elStatusText.textContent = '待機中';
        break;
    }
  }

  _updateUIState() {
    if (this.isRecording) {
      this.elBtnToggleRecord.classList.add('is-recording');
      this.elBtnToggleRecord.querySelector('.btn-icon-symbol').textContent = '⏹️';
      this.elBtnToggleRecord.querySelector('.btn-text').textContent = '録音停止';
      this.elBtnPauseRecord.disabled = false;
    } else {
      this.elBtnToggleRecord.classList.remove('is-recording');
      this.elBtnToggleRecord.querySelector('.btn-icon-symbol').textContent = '🎤';
      this.elBtnToggleRecord.querySelector('.btn-text').textContent = '録音開始';
      this.elBtnPauseRecord.disabled = true;
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '一時停止';
    }

    if (this.isPaused) {
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '再開';
      this.elBtnPauseRecord.querySelector('.btn-icon-symbol').textContent = '▶️';
    } else {
      this.elBtnPauseRecord.querySelector('.btn-text').textContent = '一時停止';
      this.elBtnPauseRecord.querySelector('.btn-icon-symbol').textContent = '⏸️';
    }

    const unsaved = this.records.length - this.lastSavedIndex;
    if (unsaved > 0) {
      this.elUnsavedBadge.style.display = 'inline-block';
      this.elUnsavedBadge.textContent = unsaved;
    } else {
      this.elUnsavedBadge.style.display = 'none';
    }
  }

  _openQrModal() {
    if (!this.apiKey && !this.gasUrl) {
      this.showToast('先に「⚙️ 設定」でGemini APIキーまたはGAS設定を入力してください。', 'warning');
      this.elModal.style.display = 'flex';
      return;
    }

    const config = {
      apiKey: this.apiKey || '',
      gasUrl: this.gasUrl || '',
      gasToken: this.gasToken || '',
      direction: this.direction || 'auto',
      category: this.category || 'HKC', gain: this.gain || '2.5',
      engineMode: this.engineMode || 'auto',
      liveModel: this.liveModel || 'models/gemini-3.5-transcribe-live',
      autoSave: this.autoSave,
      docMode: this.docMode || 'new',
      lastDocId: this.lastDocId || ''
    };

    try {
      const jsonStr = JSON.stringify(config);
      const b64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
      
      const baseUrl = window.location.origin + window.location.pathname;
      const shareUrl = `${baseUrl}#setup=${encodeURIComponent(b64)}`;

      this.elInputShareUrl.value = shareUrl;

      if (window.QRCode && QRCode.renderCanvas && this.elQrCanvas) {
        QRCode.renderCanvas(this.elQrCanvas, shareUrl, {
          size: 240,
          margin: 2,
          dark: '#1b365d',
          light: '#FFFFFF'
        });
      }

      this.elQrModal.style.display = 'flex';
      this.log('info', 'スマホ連携用QRコードを表示しました。');
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      this.showToast('QRコードの生成に失敗しました: ' + err.message, 'error');
    }
  }

  _checkHashConfig() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#setup=')) {
      try {
        const rawData = hash.substring(7);
        const jsonStr = decodeURIComponent(Array.prototype.map.call(atob(decodeURIComponent(rawData)), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const config = JSON.parse(jsonStr);

        if (config.apiKey) ConfigManager.set(ConfigManager.STORAGE_KEYS.API_KEY, config.apiKey);
        if (config.gasUrl) ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_URL, config.gasUrl);
        if (config.gasToken) ConfigManager.set(ConfigManager.STORAGE_KEYS.GAS_TOKEN, config.gasToken);
        if (config.direction) ConfigManager.set(ConfigManager.STORAGE_KEYS.DIRECTION, config.direction);
        if (config.category) ConfigManager.set(ConfigManager.STORAGE_KEYS.CATEGORY, config.category);
        if (config.gain) ConfigManager.set(ConfigManager.STORAGE_KEYS.GAIN, config.gain);
        if (config.engineMode) ConfigManager.set(ConfigManager.STORAGE_KEYS.ENGINE_MODE, config.engineMode);
        if (config.liveModel) ConfigManager.set(ConfigManager.STORAGE_KEYS.LIVE_MODEL, config.liveModel);
        if (config.autoSave !== undefined) ConfigManager.set(ConfigManager.STORAGE_KEYS.AUTO_SAVE, String(config.autoSave));
        if (config.docMode) ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, config.docMode);
        if (config.lastDocId) ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, config.lastDocId);
        if (config.folderId) ConfigManager.set(ConfigManager.STORAGE_KEYS.FOLDER_ID, config.folderId);

        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        this._loadSettings();
        this.log('success', 'スマホ連携: PC設定情報（APIキー・GAS設定）を即座にインポートしました！');
        this.showToast('📱 PCからの設定をインポートしました！', 'success');
      } catch (err) {
        console.warn('Failed to parse setup hash:', err);
        this.log('error', `設定インポート失敗: ${err.message}`);
      }
    }
  }

  showToast(message, type = 'info') {
    if (!this.elToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '🔔';

    toast.innerHTML = `<span>${icon}</span><span>${this._escapeHTML(message)}</span>`;
    this.elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
}
