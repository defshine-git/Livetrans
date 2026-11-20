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
    var targetSize = options.size || 280;
    var margin = options.margin !== undefined ? options.margin : 4;
    var darkColor = options.dark || '#000000';
    var lightColor = options.light || '#FFFFFF';

    var qr = new QRCode(0, QRErrorCorrectLevel.L);
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var totalModules = count + margin * 2;
    // 整数ピクセル単位で描画し、隣接ドットのにじみ・潰れを完全に防止
    var cellSize = Math.max(4, Math.ceil(targetSize / totalModules));
    var actualSize = totalModules * cellSize;

    var ctx = canvas.getContext('2d');
    canvas.width = actualSize;
    canvas.height = actualSize;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, actualSize, actualSize);

    ctx.fillStyle = darkColor;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
        }
      }
    }

    return {
      version: qr.typeNumber,
      moduleCount: count,
      length: text.length,
      canvasSize: actualSize
    };
};

global.QRCode = QRCode;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/**
 * app.js - Optimized Frontend Architecture for Bilingual Transcriber
 * Version: 3.0.2 (Refactored, Deduplicated & Audited Release)
 *
 * Modules:
 *  1. Constants & Shared Utilities (Language detection, Base64 UTF-8, Timeout fetch)
 *  2. ConfigManager (localStorage persistence)
 *  3. AudioCaptureService (Anti-aliased 16kHz PCM, far-field boost, iPad/iOS unlock)
 *  4. WebSpeechService (Native Web Speech API fallback)
 *  5. GeminiLiveClient (Single `audio` stream, language-lock setup, auto-reconnect x5)
 *  6. GeminiTextClient (Shared Gemini REST cascade client for Translation & Summary)
 *  7. TranslationService (FIFO queue, dynamic prior-context continuity, custom nuance prompt)
 *  8. SummaryService (On-demand lookback structured summarizer)
 *  9. GasStorageClient (Google Docs single-document sync & GAS fallback)
 * 10. LongFormUtteranceBuffer (Real-time original display + cohesive Japanese chunking)
 * 11. App (Modular UI controller with concurrency locks & DOM bounds)
 */

// ==========================================
// 1. Constants & Shared Utilities
// ==========================================
const APP_VERSION = '3.0.2';

const DEFAULT_SETTINGS = Object.freeze({
  DEFAULT_FOLDER_ID: '15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f',
  DEFAULT_LIVE_MODEL: 'models/gemini-3.5-transcribe-live',
  GEMINI_TEXT_MODELS: Object.freeze([
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ]),
  MAX_LOG_LINES: 300
});

const LANGUAGE_META = Object.freeze({
  ja: { name: '日本語', englishName: 'Japanese', badge: '🇯🇵' },
  en: { name: '英語', englishName: 'English', badge: '🇺🇸' },
  bn: { name: 'ベンガル語', englishName: 'Bengali (বাংলা)', badge: '🇧🇩' },
  hi: { name: 'ヒンディー語', englishName: 'Hindi (हिन्दी)', badge: '🇮🇳' }
});

const DIRECTION_LANGUAGE_CODES = Object.freeze({
  'ja-to-en': ['ja-JP'],
  'en-to-ja': ['en-US'],
  'bn-to-ja': ['bn-BD', 'bn-IN', 'en-US'],
  'hi-to-ja': ['hi-IN', 'en-US'],
  'auto': ['ja-JP', 'en-US', 'bn-BD', 'bn-IN', 'hi-IN']
});

const ROLES = Object.freeze([
  'Auditor (監査員)',
  'Yard Rep (ヤード担当者)',
  'Facility (施設側)',
  'Other (その他)'
]);

const ROLE_SHORT_LABELS = Object.freeze({
  'Auditor (監査員)': 'Auditor',
  'Yard Rep (ヤード担当者)': 'Yard',
  'Facility (施設側)': 'Facility',
  'Other (その他)': 'Other'
});

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a speech transcription engine for maritime and safety audits. ' +
  'You must ONLY transcribe speech into one of these four languages: Japanese (日本語), English, Bengali (বাংলা), or Hindi (हिन्दी). ' +
  'Do not transcribe speech into Korean, Swahili, or any other unlisted language. ' +
  'In shipyard contexts (e.g. Bangladesh / India), local personnel often speak in English with Bengali or Hindi words mixed in (code-mixing). ' +
  'If audio resembles Japanese phonetics, strictly transcribe it in Japanese characters.';

const TRANSLATION_PROMPT_PRESETS = Object.freeze({
  audit:
    '【テーマ・ニュアンス: 監査・法令厳密】規制要件、認証基準、不適合・是正措置、責任範囲のニュアンスを正確に翻訳してください。推測や過度な意訳は避け、専門用語や条約・規則の略称（HKC, EU-SRR, IHM, SRFP, SOC等）は原語または定訳を維持してください。',
  business:
    '【テーマ・ニュアンス: 会議・丁寧ビジネス】ビジネスミーティング・顧客折衝向けの自然で丁寧な敬語（です・ます調）に整えてください。発言の意図や結論が明確に伝わるよう、話の前後関係をなめらかに繋いで翻訳してください。',
  field:
    '【テーマ・ニュアンス: 現場・口語かみ砕き】現場作業員やヤード担当者のくだけた口語表現・言い直し・省略を自然にくみ取り、安全衛生や作業手順の状況が直感的に把握できる平易で分かりやすい日本語にしてください。',
  conference:
    '【テーマ・ニュアンス: 講演・パネル議論】国際会議・セミナー・パネルディスカッションの文脈として、登壇者の主張や背景説明の論理展開が伝わる、読みやすく洗練された解説調の日本語に翻訳してください。'
});

/** iPadOS / iOS 環境判定 */
function isIPadOrIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * 4言語（日本語・英語・ベンガル語・ヒンディー語）の高精度自動判別
 * @param {string} text
 * @param {string|null} hintedLangCode
 * @returns {'ja'|'en'|'bn'|'hi'}
 */
function detectLanguage4(text, hintedLangCode = null) {
  if (hintedLangCode) {
    const code = String(hintedLangCode).toLowerCase();
    if (code.startsWith('ja')) return 'ja';
    if (code.startsWith('bn')) return 'bn';
    if (code.startsWith('hi')) return 'hi';
    if (code.startsWith('en')) return 'en';
  }
  if (!text) return 'en';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return 'ja';
  return 'en';
}

function getLanguageDisplayName(langCode) {
  return LANGUAGE_META[langCode]?.name || String(langCode || '英語').toUpperCase();
}

function getLanguageBadge(langCode) {
  return LANGUAGE_META[langCode]?.badge || '🌐';
}

function getSpeakerShortLabel(speaker) {
  if (!speaker) return '発話';
  if (ROLE_SHORT_LABELS[speaker]) return ROLE_SHORT_LABELS[speaker];
  if (speaker.includes('Yard')) return 'Yard';
  if (speaker.includes('Auditor')) return 'Auditor';
  if (speaker.includes('Facility')) return 'Facility';
  if (speaker.includes('Other')) return 'Other';
  return speaker;
}

function getEngineShortLabel(engine) {
  if (!engine) return 'Live';
  if (engine.includes('Gemini')) return 'Live';
  if (engine.includes('Web')) return 'Web';
  return engine;
}

function encodeBase64Utf8(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
  );
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64);
  const percentEncoded = Array.prototype.map
    .call(binary, (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
    .join('');
  return decodeURIComponent(percentEncoded);
}

function encodeBase64UrlUtf8(str) {
  return encodeBase64Utf8(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlUtf8(b64url) {
  let b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return decodeBase64Utf8(b64);
}

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
// 2. Config Manager (localStorage)
// ==========================================
class ConfigManager {
  static STORAGE_KEYS = Object.freeze({
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
    LIVE_MODEL: 'glt_live_model',
    AUDIO_SOURCE: 'glt_audio_source',
    SYSTEM_INSTRUCTION: 'glt_system_instruction',
    CHUNK_MODE: 'glt_chunk_mode',
    TRANSLATION_CUSTOM_PROMPT: 'glt_translation_custom_prompt',
    TRANSLATION_PROMPT_OPEN: 'glt_translation_prompt_open',
    CONTEXT_WINDOW: 'glt_context_window',
    SUMMARY_RANGE: 'glt_summary_range',
    SUMMARY_CUSTOM_MIN: 'glt_summary_custom_min'
  });

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
// 3. Audio Capture Service (Anti-Aliased 16kHz PCM - iPad/iOS Optimized)
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
    this.gainValue = 2.5;
    this.onChunkCallback = null;
    this.onVolumeCallback = null;
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

  unlockContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      const buffer = this.audioContext.createBuffer(1, 1, 22050);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
      return this.audioContext;
    } catch (e) {
      console.warn('[AudioCapture] unlockContext failed:', e);
      return null;
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

  async _acquireMediaStream(sourceType, onEnded) {
    const isIOS = isIPadOrIOS();

    if (sourceType === 'display') {
      if (isIOS) {
        throw new Error('iPad / iPhone ではOSの仕様によりタブ音声キャプチャはサポートされていません。「マイク (対面会話)」をご利用ください。');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('お使いのブラウザはタブ・PC音声のキャプチャに対応していません。Chrome または Edge をご利用ください。');
      }

      let displayStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('画面・音声共有がキャンセルされました。');
        }
        throw new Error(`PC音声の共有に失敗しました: ${err.message}`);
      }

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error('音声が共有されていません。共有ウィンドウで「タブの音声も共有」または「音声を共有」にチェックを入れてください。');
      }

      displayStream.getVideoTracks().forEach((t) => t.stop());
      if (onEnded) {
        audioTracks[0].onended = () => onEnded();
      }
      return new MediaStream([audioTracks[0]]);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('マイクアクセスAPIが利用できません。HTTPS または http://localhost 上でアクセスしてください。');
    }

    const constraintCandidates = [
      { audio: { echoCancellation: true, noiseSuppression: !isIOS, autoGainControl: true } },
      { audio: { echoCancellation: true } },
      { audio: true }
    ];

    let lastError = null;
    for (const constraints of constraintCandidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) return stream;
      } catch (err) {
        lastError = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('マイクへのアクセスが拒否されました。iPad/ブラウザの設定からマイク使用を許可してください。');
        }
        console.warn('[AudioCapture] getUserMedia fallback:', constraints, err);
      }
    }

    throw new Error(`マイクの取得に失敗しました: ${lastError ? lastError.message : '利用可能なマイクが見つかりませんでした'}`);
  }

  async start(onChunk, onVolume, sourceType = 'mic', onEnded = null) {
    if (this.isRecording) return;
    this.onChunkCallback = onChunk;
    this.onVolumeCallback = onVolume;

    this.unlockContext();
    await this.ensureContext();

    this.mediaStream = await this._acquireMediaStream(sourceType, onEnded);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 1. 80Hz Highpass Filter (低周波ノイズ除去)
    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.value = 80;
    this.highpassNode.Q.value = 0.7;

    // 2. Pre-amp Gain Booster (遠距離集音)
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.gainValue;

    // 3. Dynamics Compressor (音割れ防止)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -32;
    this.compressorNode.knee.value = 24;
    this.compressorNode.ratio.value = 8;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.20;

    // 4. 7.5kHz Lowpass Anti-Aliasing Filter
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 7500;

    this.sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.gainNode);
    this.gainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.filterNode);

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.filterNode.connect(this.analyserNode);

    this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

    // WebKit (iOS/iPadOS) のGCによるオーディオノード切断防止
    if (typeof window !== 'undefined') {
      window._activeAudioSession = {
        context: this.audioContext,
        source: this.sourceNode,
        highpass: this.highpassNode,
        gain: this.gainNode,
        compressor: this.compressorNode,
        filter: this.filterNode,
        analyser: this.analyserNode,
        processor: this.processorNode,
        stream: this.mediaStream
      };
    }

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;

    this.processorNode.onaudioprocess = (e) => {
      e.outputBuffer.getChannelData(0).fill(0);
      if (!this.isRecording || this.isPaused) return;

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const inputBuffer = e.inputBuffer.getChannelData(0);
      if (this.onVolumeCallback && this.analyserNode) {
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        this.onVolumeCallback(Math.sqrt(sum / inputBuffer.length));
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
    if (typeof window !== 'undefined') {
      window._activeAudioSession = null;
    }

    const nodes = ['processorNode', 'analyserNode', 'filterNode', 'compressorNode', 'gainNode', 'highpassNode', 'sourceNode'];
    for (const prop of nodes) {
      if (this[prop]) {
        try { this[prop].disconnect(); } catch (e) {}
        this[prop] = null;
      }
    }
    if (this.mediaStream) {
      try { this.mediaStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

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

  _int16ToBase64(int16Array) {
    const uint8 = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.byteLength; i += chunkSize) {
      const chunk = uint8.subarray(i, Math.min(i + chunkSize, uint8.byteLength));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
}

// ==========================================
// 4. Web Speech API Service (Native Fallback)
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
    this.restartTimer = null;
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  _resolveSpeechLang(direction) {
    if (direction === 'en-to-ja') return 'en-US';
    if (direction === 'bn-to-ja') return 'bn-BD';
    if (direction === 'hi-to-ja') return 'hi-IN';
    return 'ja-JP';
  }

  setDirection(direction) {
    this.direction = direction;
    if (this.recognition && this.isListening) {
      const targetLang = this._resolveSpeechLang(direction);
      if (this.recognition.lang !== targetLang) {
        this.recognition.lang = targetLang;
        try { this.recognition.stop(); } catch (e) {}
      }
    }
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = this._resolveSpeechLang(this.direction);

    rec.onresult = (event) => {
      if (!this.isListening || this.isPaused) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const finalTranscript = item[0].transcript.trim();
          if (finalTranscript.length > 0 && this.onFinalCallback) {
            this.onFinalCallback(finalTranscript, detectLanguage4(finalTranscript, rec.lang));
          }
        } else {
          interim += item[0].transcript;
        }
      }
      if (interim && this.onInterimCallback) {
        this.onInterimCallback(interim);
      }
    };

    rec.onerror = (event) => {
      console.warn('[WebSpeech] Error:', event.error);
      if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && this.onErrorCallback) {
        const msg = isIPadOrIOS()
          ? 'マイクまたは音声認識の使用が許可されていません。iPadの「設定」→「Safari」および「Siriと検索」の音声入力を有効にしてください。'
          : 'マイクの使用が許可されていません。';
        this.onErrorCallback(new Error(msg));
      }
    };

    rec.onend = () => {
      if (!this.isListening || this.isPaused) return;
      clearTimeout(this.restartTimer);
      // iOS Safari での InvalidStateError 回避のため 200ms 遅延で再起動
      this.restartTimer = setTimeout(() => {
        if (!this.isListening || this.isPaused) return;
        try {
          if (this.recognition) this.recognition.start();
        } catch (e) {
          console.warn('[WebSpeech] Restart failed, re-initializing:', e);
          try {
            this.recognition = this._initRecognition();
            if (this.recognition) this.recognition.start();
          } catch (e2) {
            console.error('[WebSpeech] Re-init start failed:', e2);
          }
        }
      }, 200);
    };

    return rec;
  }

  start(direction, onInterim, onFinal, onError) {
    if (!this.isSupported()) {
      const msg = isIPadOrIOS()
        ? 'お使いのブラウザでは音声認識APIが利用できません。iPad/iPhoneでは「Safari」をご利用いただくか、Gemini Liveモードをご利用ください。'
        : 'ブラウザの音声認識 (Web Speech API) が利用できません。Google Chrome または Microsoft Edge をご利用ください。';
      throw new Error(msg);
    }

    this.direction = direction;
    this.onInterimCallback = onInterim;
    this.onFinalCallback = onFinal;
    this.onErrorCallback = onError;
    this.isPaused = false;
    this.isListening = true;

    clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }
    this.recognition = this._initRecognition();
    if (this.recognition) {
      this.recognition.start();
    }
  }

  pause() {
    this.isPaused = true;
    clearTimeout(this.restartTimer);
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
    clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
  }
}

// ==========================================
// 5. Gemini Live WebSocket Client (Bandwidth-Optimized & Auto-Reconnect)
// ==========================================
class GeminiLiveClient {
  static WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  static SESSION_RECONNECT_INTERVAL = 570000;
  static MAX_RECONNECT_ATTEMPTS = 5;
  static RECONNECT_DELAYS_MS = Object.freeze([1500, 3000, 5000, 8000, 12000]);
  static MAX_QUEUED_CHUNKS = 80; // 約3.5秒分の音声チャンクを再接続中に保持

  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.direction = 'auto';
    this.modelName = DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.isReconnecting = false;
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.chunkQueue = [];
    this.systemInstruction = null;

    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;
    this._sessionTimer = null;
    this._reconnectTimer = null;
    this._onlineHandler = null;

    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onTurnCompleteCallback = null;
    this.onErrorCallback = null;
    this.onReconnectingCallback = null;
    this.onReconnectedCallback = null;
    this.onDisconnectCallback = null;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[GeminiLive] ${message}`);
    }
  }

  setDirection(direction) {
    const changed = this.direction !== direction;
    this.direction = direction;
    this.log('info', `Gemini Live 認識言語設定を更新: ${direction}`);

    if (changed && this.isConnected && this.ws && !this.isReconnecting) {
      this.log('info', `翻訳方向変更 (${direction}) を認識エンジンへ即時反映するためシームレス再接続します...`);
      this._seamlessReconnect()
        .then(() => {
          this.log('success', `認識言語を ${direction} へ切り替え完了しました。`);
        })
        .catch((err) => {
          this.log('warn', `翻訳方向切替に伴う再接続失敗: ${err.message}`);
          if (!this.manualDisconnect) {
            this._startAutoReconnectLoop(err.closeCode || 1006, err.message);
          }
        });
    }
  }

  _normalizeModelName(model) {
    if (!model) return DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL;
    return model.startsWith('models/') ? model : `models/${model}`;
  }

  _isNonRetryableCloseCode(code) {
    return code === 1007 || code === 1008;
  }

  _enqueueChunk(base64Pcm) {
    if (!base64Pcm) return;
    if (this.chunkQueue.length >= GeminiLiveClient.MAX_QUEUED_CHUNKS) {
      this.chunkQueue.shift();
    }
    this.chunkQueue.push(base64Pcm);
  }

  connect(apiKey, direction, modelName, systemInstruction = null, options = {}) {
    const preserveQueue = !!options.preserveQueue;

    return new Promise((resolve, reject) => {
      this.apiKey = apiKey;
      this.direction = direction;
      this.modelName = this._normalizeModelName(modelName);
      this.systemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
      this.manualDisconnect = false;
      this.isSetupComplete = false;
      this.isConnected = false;
      if (!preserveQueue) {
        this.chunkQueue = [];
        this.reconnectAttempt = 0;
      }

      this._cleanupTimeout();
      this._connectResolve = resolve;
      this._connectReject = reject;

      if (!apiKey) {
        this._connectResolve = null;
        this._connectReject = null;
        return reject(new Error('Gemini API キーが未設定です。'));
      }

      const url = `${GeminiLiveClient.WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
      this.log('info', `WebSocket接続開始: ${this.modelName}${preserveQueue ? ' (再接続)' : ''}`);

      let socket;
      try {
        socket = new WebSocket(url);
        this.ws = socket;
      } catch (err) {
        this.log('error', `WebSocket作成失敗: ${err.message}`);
        this._connectResolve = null;
        this._connectReject = null;
        return reject(new Error(`WebSocket初期化エラー: ${err.message}`));
      }

      this._connectTimeout = setTimeout(() => {
        if (this.ws !== socket || this.isSetupComplete) return;
        const timeoutErr = new Error('Gemini Live API への接続がタイムアウトしました。');
        this.log('warn', '接続タイムアウト (10秒)');
        const pendingReject = this._connectReject;
        this._connectResolve = null;
        this._connectReject = null;
        try { socket.close(); } catch (e) {}
        if (this.ws === socket) this.ws = null;
        if (pendingReject) pendingReject(timeoutErr);
      }, 10000);

      socket.onopen = () => {
        if (this.ws !== socket || this.manualDisconnect) {
          try { socket.close(); } catch (e) {}
          return;
        }
        this.log('info', 'WebSocket接続オープン。Setup送信中...');
        this._sendSetupMessage(socket);
      };

      socket.onmessage = async (event) => {
        if (this.ws !== socket || this.manualDisconnect) return;
        let raw = event.data;
        if (event.data instanceof Blob) {
          raw = await event.data.text();
        }
        if (this.ws !== socket || this.manualDisconnect) return;
        this._handleServerMessage(raw);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.log('error', 'WebSocket通信エラーが発生しました。');
        this._cleanupTimeout();
        if (this._connectReject) {
          const pendingReject = this._connectReject;
          this._connectResolve = null;
          this._connectReject = null;
          pendingReject(new Error('Gemini Live API への接続に失敗しました。'));
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.log('warn', `WebSocket切断: Code ${event.code}${event.reason ? ` (${event.reason})` : ''}`);
        this._cleanupTimeout();
        this._clearSessionTimer();

        const wasEstablished = this.isConnected && this.isSetupComplete;
        this.isConnected = false;
        this.isSetupComplete = false;
        this.ws = null;

        if (this._connectReject) {
          let errorMsg = `接続が切断されました (Code: ${event.code})`;
          if (event.code === 1006) {
            errorMsg = 'Gemini Live APIに接続できませんでした (Code: 1006)。通信状態・APIキーまたはモデル権限を確認してください。';
          } else if (event.code === 1007 || event.code === 1008) {
            errorMsg = `認証またはリクエスト形式エラーです (Code: ${event.code})`;
          }
          const err = new Error(errorMsg);
          err.closeCode = event.code;
          const pendingReject = this._connectReject;
          this._connectResolve = null;
          this._connectReject = null;
          pendingReject(err);
          return;
        }

        if (this.manualDisconnect || this.isReconnecting) return;

        if (wasEstablished) {
          if (this._isNonRetryableCloseCode(event.code)) {
            this.log('error', `回復不能な切断コード (${event.code}) のため自動再接続を中止します。`);
            if (this.onDisconnectCallback) {
              this.onDisconnectCallback(event.code, event.reason, false);
            }
            return;
          }
          this._startAutoReconnectLoop(event.code, event.reason);
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

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
  }

  _startSessionResumptionTimer() {
    this._clearSessionTimer();
    this._sessionTimer = setTimeout(async () => {
      if (this.manualDisconnect || this.isReconnecting) return;
      this.log('info', 'Gemini Live 10分セッション制限に伴う自動シームレス再接続を実行します...');
      try {
        await this._seamlessReconnect();
        this.log('success', 'シームレス再接続完了。セッションが継続更新されました。');
      } catch (err) {
        this.log('warn', `セッション定期更新失敗 (${err.message})。自動リトライへ移行します...`);
        if (!this.manualDisconnect) {
          this._startAutoReconnectLoop(err.closeCode || 1006, err.message);
        }
      }
    }, GeminiLiveClient.SESSION_RECONNECT_INTERVAL);
  }

  async _seamlessReconnect() {
    if (this.manualDisconnect) return;
    this.isReconnecting = true;
    const oldSocket = this.ws;
    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
    this._clearSessionTimer();

    if (oldSocket) {
      try {
        if (oldSocket.readyState === WebSocket.OPEN) {
          oldSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        }
        oldSocket.close();
      } catch (e) {}
    }

    try {
      await this.connect(this.apiKey, this.direction, this.modelName, this.systemInstruction, { preserveQueue: true });
      this.isReconnecting = false;
      this.reconnectAttempt = 0;
    } catch (err) {
      this.isReconnecting = false;
      throw err;
    }
  }

  _startAutoReconnectLoop(code, reason = '') {
    if (this.manualDisconnect || this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempt = 0;
    this._scheduleNextReconnect(code, reason);
  }

  _scheduleNextReconnect(lastCode, lastReason = '') {
    if (this.manualDisconnect) {
      this.isReconnecting = false;
      this._clearReconnectTimer();
      return;
    }

    this.reconnectAttempt += 1;
    const maxAttempts = GeminiLiveClient.MAX_RECONNECT_ATTEMPTS;

    if (this.reconnectAttempt > maxAttempts) {
      this.log('error', `自動再接続が上限 (${maxAttempts}回) に達しました。セッションを終了します。`);
      this.isReconnecting = false;
      this._clearReconnectTimer();
      this.chunkQueue = [];
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(lastCode, lastReason || `自動再接続上限 (${maxAttempts}回) 到達`, true);
      }
      return;
    }

    const delayIdx = Math.min(this.reconnectAttempt - 1, GeminiLiveClient.RECONNECT_DELAYS_MS.length - 1);
    const delayMs = GeminiLiveClient.RECONNECT_DELAYS_MS[delayIdx];
    const attemptNum = this.reconnectAttempt;

    this.log(
      'warn',
      `回線瞬断検知 (Code: ${lastCode})。${(delayMs / 1000).toFixed(1)}秒後に自動再接続を試行します (${attemptNum}/${maxAttempts}回目)...`
    );

    if (this.onReconnectingCallback) {
      this.onReconnectingCallback(attemptNum, maxAttempts, delayMs, lastCode);
    }

    const executeAttempt = async () => {
      this._clearReconnectTimer();
      if (this.manualDisconnect) {
        this.isReconnecting = false;
        return;
      }

      this.log('info', `自動再接続を実行中 (${attemptNum}/${maxAttempts}回目)...`);
      try {
        await this.connect(this.apiKey, this.direction, this.modelName, this.systemInstruction, { preserveQueue: true });
        if (this.manualDisconnect) {
          this.disconnect();
          return;
        }
        this.isReconnecting = false;
        const recoveredOnAttempt = this.reconnectAttempt;
        this.reconnectAttempt = 0;
        this.log('success', `自動再接続に成功しました (${recoveredOnAttempt}回目で復帰)。音声認識を継続します。`);
        if (this.onReconnectedCallback) {
          this.onReconnectedCallback(recoveredOnAttempt);
        }
      } catch (err) {
        if (this.manualDisconnect) {
          this.isReconnecting = false;
          return;
        }
        const errCode = err.closeCode || lastCode || 1006;
        this.log('warn', `自動再接続 ${attemptNum}/${maxAttempts}回目失敗: ${err.message}`);
        if (this._isNonRetryableCloseCode(errCode)) {
          this.isReconnecting = false;
          this.chunkQueue = [];
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback(errCode, err.message, false);
          }
          return;
        }
        this._scheduleNextReconnect(errCode, err.message);
      }
    };

    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(executeAttempt, delayMs);

    if (typeof window !== 'undefined') {
      this._onlineHandler = () => {
        if (!this.manualDisconnect && this.isReconnecting && this._reconnectTimer) {
          this.log('info', 'ネットワーク復帰を検知しました。待機をスキップして即座に再接続を試行します...');
          executeAttempt();
        }
      };
      window.addEventListener('online', this._onlineHandler, { once: true });
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    this._cleanupTimeout();
    this._clearSessionTimer();
    this._clearReconnectTimer();
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this._connectResolve = null;
    this._connectReject = null;

    const oldSocket = this.ws;
    this.ws = null;
    if (oldSocket) {
      if (oldSocket.readyState === WebSocket.OPEN) {
        try { oldSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch (e) {}
      }
      try { oldSocket.close(); } catch (e) {}
    }
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];
  }

  sendAudioChunk(base64Pcm) {
    if (this.manualDisconnect) return;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      if (this.isReconnecting || (this.ws && (this.ws.readyState === WebSocket.CONNECTING || !this.isSetupComplete))) {
        this._enqueueChunk(base64Pcm);
      }
      return;
    }

    while (this.chunkQueue.length > 0) {
      this._dispatchChunk(this.chunkQueue.shift());
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
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('Failed to send audio chunk:', e);
    }
  }

  _buildEffectiveSystemInstruction() {
    const rawUserInstruction = (this.systemInstruction || '').trim();
    const isDefault = !rawUserInstruction || rawUserInstruction === DEFAULT_SYSTEM_INSTRUCTION.trim();

    const lockRules = {
      'en-to-ja':
        'STRICT LANGUAGE LOCK (ENGLISH ONLY): You are transcribing spoken English for maritime and safety audits. ' +
        'Transcribe ALL speech STRICTLY in English using standard Latin alphabet characters ONLY. ' +
        'Even if the speaker has a South Asian (Indian/Bangladeshi), Japanese, or other non-native accent, or if audio is noisy, ' +
        'ALWAYS transcribe it as English words in the Latin alphabet. ' +
        'NEVER output Hindi (Devanagari script), Bengali script, Japanese, Korean, or any non-Latin characters.',
      'ja-to-en':
        'STRICT LANGUAGE LOCK (JAPANESE ONLY): You are transcribing spoken Japanese for maritime and safety audits. ' +
        'Transcribe ALL speech STRICTLY in natural Japanese (kanji, hiragana, katakana, and standard maritime abbreviations like HKC/IHM/EU-SRR). ' +
        'NEVER output Hindi (Devanagari), Bengali, Korean, or Swahili characters.',
      'bn-to-ja':
        'STRICT LANGUAGE LOCK (BENGALI & ENGLISH ONLY): Transcribe speech ONLY in Bengali (বাংলা) and/or English (for code-mixing/technical terms). ' +
        'NEVER output Hindi (Devanagari script), Korean, or other unlisted languages.',
      'hi-to-ja':
        'STRICT LANGUAGE LOCK (HINDI & ENGLISH ONLY): Transcribe speech ONLY in Hindi (हिन्दी) and/or English (for code-mixing/technical terms). ' +
        'NEVER output Bengali script, Korean, or other unlisted languages.'
    };

    const lock = lockRules[this.direction];
    if (lock) {
      return isDefault ? lock : `${rawUserInstruction}\n\n[HIGHEST PRIORITY OVERRIDE - ${lock}]`;
    }
    return rawUserInstruction || DEFAULT_SYSTEM_INSTRUCTION;
  }

  _sendSetupMessage(targetSocket = null) {
    const sock = targetSocket || this.ws;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;

    const languageCodes = DIRECTION_LANGUAGE_CODES[this.direction] || DIRECTION_LANGUAGE_CODES.auto;
    const effectiveInstruction = this._buildEffectiveSystemInstruction();

    const setupPayload = {
      setup: {
        model: this.modelName,
        generationConfig: { responseModalities: ['TEXT'] },
        systemInstruction: { parts: [{ text: effectiveInstruction }] },
        inputAudioTranscription: { languageCodes }
      }
    };

    this.log('info', `Setup送信 (方向: ${this.direction} | 言語指定: ${languageCodes.join(', ')})`);
    sock.send(JSON.stringify(setupPayload));
  }

  _handleServerMessage(rawMessage) {
    try {
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (data.setupComplete) {
        this.log('success', 'SetupComplete 受信。音声認識ストリーム準備完了 (audio単一送信モード)。');
        this.isConnected = true;
        this.isSetupComplete = true;
        this._cleanupTimeout();
        this._startSessionResumptionTimer();

        if (this._connectResolve) {
          const pendingResolve = this._connectResolve;
          this._connectResolve = null;
          this._connectReject = null;
          pendingResolve();
        }

        if (this.chunkQueue.length > 0) {
          this.log('info', `再接続中に保持していた音声バッファ (${this.chunkQueue.length}チャンク) を一括送信します...`);
        }
        while (this.chunkQueue.length > 0) {
          this._dispatchChunk(this.chunkQueue.shift());
        }
        return;
      }

      if (data.serverContent) {
        const sc = data.serverContent;
        const interimObj = sc.interimInputTranscription || sc.interim_input_transcription;
        if (interimObj && typeof interimObj.text === 'string' && interimObj.text.length > 0 && this.onInterimCallback) {
          this.onInterimCallback(interimObj.text);
        }

        const finalObj = sc.inputTranscription || sc.input_transcription;
        if (finalObj && typeof finalObj.text === 'string' && finalObj.text.length > 0) {
          const rawFinalText = finalObj.text;
          const langCode = finalObj.languageCode || null;
          if (rawFinalText.trim().length > 0) {
            this.log('info', `認識断片受信: "${rawFinalText.trim()}"`);
          }
          if (this.onFinalCallback) {
            this.onFinalCallback(rawFinalText, langCode);
          }
        }

        if ((sc.turnComplete || sc.turn_complete) && this.onTurnCompleteCallback) {
          this.onTurnCompleteCallback();
        }
      }
    } catch (e) {
      console.warn('Server message parse error:', e);
    }
  }
}

// ==========================================
// 6. Shared Gemini Text Client (Cascade Fallback + Preferred Model Cache)
// ==========================================
class GeminiTextClient {
  constructor() {
    this._preferredModel = null;
    this.onLogCallback = null;
  }

  log(type, tag, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[${tag}] ${message}`);
    }
  }

  async generateText({ apiKey, prompt, temperature = 0.15, maxOutputTokens = 2048, timeoutMs = 20000, logTag = 'Gemini' }) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini APIキーが未設定です。');
    }

    const baseModels = DEFAULT_SETTINGS.GEMINI_TEXT_MODELS;
    const modelsToTry = this._preferredModel
      ? [this._preferredModel, ...baseModels.filter((m) => m !== this._preferredModel)]
      : baseModels;

    let lastError = 'Gemini API 応答を取得できませんでした。';

    for (const modelName of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens }
          })
        }, timeoutMs);

        if (res.ok) {
          const data = await res.json();
          const outText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof outText === 'string' && outText.trim().length > 0) {
            this._preferredModel = modelName;
            return { text: outText.trim(), model: modelName };
          }
          lastError = `Gemini (${modelName}): 空の応答を受信`;
        } else {
          const errData = await res.json().catch(() => null);
          const errDetail = errData?.error?.message || `HTTP ${res.status}`;
          lastError = `Gemini (${modelName}): ${errDetail}`;
          if (this._preferredModel === modelName) this._preferredModel = null;
          this.log('warn', logTag, `Gemini (${modelName}) 失敗: ${errDetail}`);
        }
      } catch (err) {
        if (this._preferredModel === modelName) this._preferredModel = null;
        const reason = err.name === 'AbortError' ? `タイムアウト (${Math.round(timeoutMs / 1000)}秒)` : err.message;
        lastError = `Gemini (${modelName}): ${reason}`;
        this.log('warn', logTag, `Gemini (${modelName}) 通信エラー: ${reason}`);
      }
    }

    throw new Error(lastError);
  }
}

// ==========================================
// 7. Translation Service & Resilient FIFO Queue
// ==========================================
class TranslationService {
  constructor(geminiTextClient) {
    this.textClient = geminiTextClient;
    this.queue = [];
    this.isProcessing = false;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Translation] ${message}`);
    }
  }

  enqueue(text, direction, category, apiKey, gasUrl, gasToken, recordId, onComplete, contextProvider = null, customPrompt = '') {
    this.queue.push({ text, direction, category, apiKey, gasUrl, gasToken, recordId, onComplete, contextProvider, customPrompt });
    this._processNext();
  }

  async _processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift();
    try {
      let resolvedContext = [];
      if (typeof job.contextProvider === 'function') {
        try {
          resolvedContext = job.contextProvider() || [];
        } catch (ctxErr) {
          this.log('warn', `前文脈取得時エラー: ${ctxErr.message}`);
        }
      } else if (Array.isArray(job.contextProvider)) {
        resolvedContext = job.contextProvider;
      }

      const result = await this._executeTranslation({ ...job, contextRecords: resolvedContext });
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

  _tailSnippet(str, maxChars) {
    const clean = String(str || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length <= maxChars ? clean : '…' + clean.slice(-maxChars).trim();
  }

  _resolveLanguagePair(text, direction) {
    if (direction === 'ja-to-en') return { srcLang: 'ja', targetLang: 'en' };
    if (direction === 'en-to-ja') return { srcLang: 'en', targetLang: 'ja' };
    if (direction === 'bn-to-ja') return { srcLang: 'bn', targetLang: 'ja' };
    if (direction === 'hi-to-ja') return { srcLang: 'hi', targetLang: 'ja' };
    const srcLang = detectLanguage4(text);
    return { srcLang, targetLang: srcLang === 'ja' ? 'en' : 'ja' };
  }

  _buildPrompt({ text, direction, category, srcLang, targetLang, validContext, customPrompt }) {
    const srcName = LANGUAGE_META[srcLang]?.englishName || 'the source language';
    const targetName = LANGUAGE_META[targetLang]?.englishName || 'Japanese';

    let contextBlock = '';
    if (validContext.length > 0) {
      const earlierItems = validContext.slice(0, -1);
      const immediatePrev = validContext[validContext.length - 1];
      const sections = [];

      if (earlierItems.length > 0) {
        const earlierLines = earlierItems.map((c, idx) => {
          const spk = c.speaker ? `[${c.speaker}] ` : '';
          const origSnippet = this._tailSnippet(c.original, 320);
          const transSnippet = this._tailSnippet(c.translated, 320);
          return `  (${idx + 1}) ${spk}Original: ${origSnippet}${transSnippet ? `\n      Translation: ${transSnippet}` : ''}`;
        });
        sections.push('Earlier turns (oldest to newer):\n' + earlierLines.join('\n'));
      }

      if (immediatePrev) {
        const spk = immediatePrev.speaker ? `[${immediatePrev.speaker}] ` : '';
        const origSnippet = this._tailSnippet(immediatePrev.original, 800);
        const transSnippet = this._tailSnippet(immediatePrev.translated, 800);
        sections.push(
          'Immediately preceding turn (HIGHEST PRIORITY for continuity):\n' +
          `  ${spk}Original: ${origSnippet}` +
          (transSnippet ? `\n  Translation: ${transSnippet}` : '')
        );
      }

      contextBlock =
        '[Previous Conversation Context — FOR CONTEXTUAL CONTINUITY ONLY. NEVER RE-TRANSLATE OR REPEAT THIS SECTION]\n' +
        sections.join('\n\n') + '\n\n';
    }

    const domainHint = category
      ? ` Domain context: Maritime Ship Recycling / Safety Audit (${category}). Use accurate technical terminology.`
      : '';

    const longFormInstruction = targetLang === 'ja'
      ? '5. The input may contain multiple sentences or spoken ASR fragments with minor filler/stutters. Translate the ENTIRE passage as one cohesive, natural, well-structured Japanese paragraph that preserves logical flow, causality, and nuance—do NOT produce choppy literal clause-by-clause translations.\n'
      : '5. Produce fluent, natural, and accurate business English preserving the speaker\'s complete meaning.\n';

    const contextUsageInstruction = validContext.length > 0
      ? (targetLang === 'ja'
        ? '6. CONTEXT-AWARE JAPANESE TRANSLATION: Actively use [Previous Conversation Context] so the Japanese translation flows seamlessly from prior turns:\n' +
          '   - Resolve ambiguous pronouns (it, they, this, that, there, the same, so, etc.) and omitted subjects/objects using the prior context, explicitly clarifying the referent in natural Japanese whenever needed for readability.\n' +
          '   - If [Text to Translate] continues a sentence or explanation from the immediately preceding turn (e.g., due to speech segmentation), connect smoothly in logic, tense, and nuance without duplicating what was already translated.\n' +
          '   - If the preceding turn was a question or remark by another speaker, phrase the Japanese naturally as a response or follow-up to it.\n' +
          '   - Keep technical terminology, proper nouns, abbreviations, and register/politeness consistent with the previous Japanese translations.\n' +
          '   - If ASR misheard a technical term in [Text to Translate], disambiguate it using the topic established in the prior context.\n'
        : '6. CONTEXT-AWARE TRANSLATION: Use [Previous Conversation Context] to resolve pronouns, omitted subjects, and domain terminology consistently with previous turns, ensuring natural continuity without re-translating prior turns.\n')
      : '';

    const isStrictEnglishToJa = direction === 'en-to-ja';
    const isStrictJaToEnglish = direction === 'ja-to-en';

    const culturalContextLine = isStrictEnglishToJa
      ? 'Context: The speaker is speaking English (possibly with a non-native accent). If minor speech-recognition artifacts or misrecognized characters appear, infer the intended English meaning from the surrounding maritime audit context.\n'
      : isStrictJaToEnglish
      ? 'Context: The speaker is speaking Japanese during a maritime/safety audit.\n'
      : 'Context: In shipyard audits (e.g. Bangladesh / India), local personnel often speak in English with Bengali or Hindi words mixed in (code-mixing/Benglish).\n';

    const constraint3And4 = isStrictEnglishToJa
      ? '3. Treat the input strictly as English speech to be translated into natural Japanese.\n' +
        '4. Do not leave stray foreign words untranslated; express the complete intended meaning clearly in natural Japanese.\n'
      : isStrictJaToEnglish
      ? '3. Treat the input strictly as Japanese speech to be translated into natural, professional English.\n' +
        '4. Preserve maritime/regulatory abbreviations (e.g., HKC, IHM, EU-SRR, SRFP, HSE) accurately.\n'
      : '3. The input must ONLY be interpreted within Japanese, English, Bengali, or Hindi. Never interpret as Korean, Swahili, or any other language.\n' +
        '4. If the speaker speaks English mixed with Bengali or Hindi terms, seamlessly translate the complete intended meaning into natural Japanese.\n';

    const trimmedCustomPrompt = String(customPrompt || '').trim();
    const customPromptBlock = trimmedCustomPrompt
      ? `[Additional Theme & Nuance Instructions — Follow these tone, domain, and terminology preferences while STRICTLY obeying constraints 1 and 2 (output ONLY the translation with no commentary)]:\n${trimmedCustomPrompt}\n\n`
      : '';

    return (
      `You are a professional consecutive/simultaneous interpreter specializing in maritime audit and safety.${domainHint}\n` +
      culturalContextLine +
      `Translate ONLY the [Text to Translate] from ${srcName} into fluent, natural, and accurate ${targetName}.\n` +
      'STRICT CONSTRAINTS:\n' +
      '1. Return ONLY the direct translation of [Text to Translate].\n' +
      '2. Do not include quotes, explanations, language labels, prefixes, or notes.\n' +
      constraint3And4 +
      longFormInstruction +
      contextUsageInstruction + '\n' +
      customPromptBlock +
      contextBlock +
      `[Text to Translate]:\n${text}`
    );
  }

  async _executeTranslation({ text, direction, category, apiKey, gasUrl, gasToken, contextRecords = [], customPrompt = '' }) {
    if (!text || text.trim() === '') return { translated: '', speakerLang: 'ja' };

    const { srcLang, targetLang } = this._resolveLanguagePair(text, direction);
    const validContext = Array.isArray(contextRecords)
      ? contextRecords.filter((c) => c && (c.original || c.translated))
      : [];

    const trimmedCustomPrompt = String(customPrompt || '').trim();
    const prompt = this._buildPrompt({ text, direction, category, srcLang, targetLang, validContext, customPrompt: trimmedCustomPrompt });

    // Layer 1: Shared Gemini REST Client
    if (apiKey && apiKey.trim() !== '') {
      try {
        const res = await this.textClient.generateText({
          apiKey,
          prompt,
          temperature: 0.15,
          maxOutputTokens: 2048,
          timeoutMs: 20000,
          logTag: 'Translation'
        });
        const ctxNote = validContext.length > 0 ? ` / 文脈${validContext.length}件参照` : '';
        const customNote = trimmedCustomPrompt ? ' / 追記プロンプト適用' : '';
        this.log('success', `Gemini (${res.model}) 長文翻訳完了 (${text.length}文字 ➔ ${res.text.length}文字${ctxNote}${customNote})`);
        return { translated: res.text, speakerLang: srcLang };
      } catch (err) {
        this.log('warn', `Gemini 翻訳全モデル失敗 (${err.message})`);
      }
    } else {
      this.log('warn', 'Gemini APIキーが未入力のため、GASバックアップ翻訳を試行します。');
    }

    // Layer 2: GAS Web App (LanguageApp) Fallback
    if (gasUrl && gasUrl.trim() !== '') {
      this.log('info', 'GAS (LanguageApp) による自動フォールバック翻訳を実行中...');
      try {
        const gasRes = await fetchWithTimeout(gasUrl.trim(), {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'translate',
            token: gasToken || '',
            text,
            srcLang,
            targetLang
          })
        }, 20000);

        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.status === 'success' && gasData.translated) {
            this.log('success', `GAS翻訳完了: "${gasData.translated}"`);
            return { translated: gasData.translated.trim(), speakerLang: srcLang };
          }
          if (gasData.message) this.log('warn', `GAS翻訳応答エラー: ${gasData.message}`);
        } else {
          this.log('warn', `GAS翻訳通信エラー: HTTP ${gasRes.status}`);
        }
      } catch (gasErr) {
        const gasReason = gasErr.name === 'AbortError' ? 'タイムアウト (20秒)' : gasErr.message;
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
// 8. Summary Service (On-Demand Lookback Summarizer)
// ==========================================
class SummaryService {
  constructor(geminiTextClient) {
    this.textClient = geminiTextClient;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Summary] ${message}`);
    }
  }

  async generateSummary({ records, pendingText, rangeLabel, category, customPrompt, apiKey }) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('サマリー生成には Gemini API キーが必要です。設定画面から登録してください。');
    }

    const lines = [];
    if (Array.isArray(records)) {
      for (const r of records) {
        const timeStr = r.time || '--:--:--';
        const spk = r.speaker || '発話';
        const orig = String(r.originalText || '').trim();
        const hasValidTrans =
          !r.isTranslating &&
          r.translatedText &&
          r.translatedText.trim() !== '' &&
          !r.translatedText.startsWith('【翻訳');
        const trans = hasValidTrans ? r.translatedText.trim() : '';

        if (orig || trans) {
          let entry = `[${timeStr}] (${spk})`;
          if (trans && orig && trans !== orig) {
            entry += `\n  訳文: ${trans}\n  原文: ${orig}`;
          } else {
            entry += `\n  内容: ${trans || orig}`;
          }
          lines.push(entry);
        }
      }
    }

    const cleanPending = String(pendingText || '').trim();
    if (cleanPending) {
      lines.push(`[現在発話中・未確定]\n  原文: ${cleanPending}`);
    }

    if (lines.length === 0) {
      throw new Error('指定された範囲にサマリー対象の発話がありません。');
    }

    let transcriptText = lines.join('\n\n');
    const MAX_INPUT_CHARS = 24000;
    if (transcriptText.length > MAX_INPUT_CHARS) {
      transcriptText = '…(古い一部発話を省略)…\n\n' + transcriptText.slice(-MAX_INPUT_CHARS);
    }

    const domainHint = category
      ? `対象分野: 海事・シップリサイクル / 安全衛生監査 (${category})。専門用語や条約・規則の略称（HKC, EU-SRR, IHM, SRFP, SOC, HSE等）は正確に保持してください。`
      : '';

    const customThemeHint = String(customPrompt || '').trim()
      ? `\n【ユーザー指定のテーマ・ニュアンス方針】\n${String(customPrompt).trim()}\n`
      : '';

    const prompt =
      'あなたは海事・現地監査および国際会議に精通した優秀な議事録作成・要約アシスタントです。\n' +
      `${domainHint}\n` +
      `以下の会話ログ（対象範囲: ${rangeLabel}）を読み、日本語で簡潔かつ実務にすぐ使える構造化サマリーを作成してください。\n` +
      customThemeHint +
      '\n【出力ルール】\n' +
      '1. 必ず以下のMarkdown見出し構成で日本語出力すること（該当内容が全く無い見出しは省略可）：\n' +
      '### 要点サマリー\n' +
      '（この時間帯の議論の結論・全体の流れを2〜4文で簡潔にまとめる）\n\n' +
      '### 主なトピック・発言内容\n' +
      '- 重要な発言・説明・質疑応答を話者や論点ごとに箇条書きで整理（具体名・数値・条件があれば落とさない）\n\n' +
      '### 確認事項・合意・今後のアクション / 課題\n' +
      '- 決定事項、宿題、懸念点、未解決の課題があれば箇条書きで整理\n\n' +
      '2. ログに含まれていない事実・数値・結論を推測や創作で補わないこと。\n' +
      '3. 音声認識の軽微な誤字・言い直しは前後文脈から自然に補正してまとめること。\n' +
      '4. 前置き（「以下がサマリーです」等）や締めの挨拶は書かず、最初の「### 要点サマリー」から直接出力すること。\n\n' +
      `【会話ログ（時系列順）】\n${transcriptText}`;

    const res = await this.textClient.generateText({
      apiKey,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 2048,
      timeoutMs: 30000,
      logTag: 'Summary'
    });

    this.log('success', `Gemini (${res.model}) サマリー生成完了 (${rangeLabel} / ${lines.length}件)`);
    return { summary: res.text, model: res.model };
  }
}

// ==========================================
// 9. GAS Storage Client (Google Docs Integration)
// ==========================================
class GasStorageClient {
  static extractFolderId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || String(input).trim();
  }

  static extractDocId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || String(input).trim();
  }

  static _validateGasUrl(gasUrl) {
    if (!gasUrl) throw new Error('GAS Web App URLが設定されていません。');
    const trimmedUrl = gasUrl.trim();
    if (!trimmedUrl.startsWith('https://script.google.com/')) {
      throw new Error('GAS Web App URLは "https://script.google.com/..." で始まる必要があります。');
    }
    if (trimmedUrl.endsWith('/edit')) {
      throw new Error('GASエディタの編集URLが設定されています。「デプロイ」→「ウェブアプリ」で発行されたURL (.../exec) を設定してください。');
    }
    return trimmedUrl;
  }

  static _parseGasJson(rawText) {
    try {
      return JSON.parse(rawText);
    } catch (jsonErr) {
      if (rawText.includes('<html') || rawText.includes('<!DOCTYPE') || rawText.includes('accounts.google.com')) {
        throw new Error('Googleのログイン画面が返却されました。GASのデプロイ設定で「アクセスできるユーザー」を「全員 (Anyone)」に設定してください。');
      }
      throw new Error(`GAS応答の解析失敗: ${rawText.slice(0, 100)}`);
    }
  }

  static async ping(gasUrl, token) {
    const trimmedUrl = GasStorageClient._validateGasUrl(gasUrl);
    try {
      const res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'ping', token: token || '' })
      }, 12000);

      const data = GasStorageClient._parseGasJson(await res.text());
      if (data.status === 'error') {
        throw new Error(data.message || 'GASエラー');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('GASサーバーが12秒以内に応答しませんでした（タイムアウト）。URLとデプロイ状態を確認してください。');
      }
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('GASサーバーに接続できません (CORS/ネットワークエラー)。デプロイ設定で「アクセスできるユーザー: 全員」になっているか確認してください。');
      }
      throw err;
    }
  }

  static async saveTranscript(gasUrl, { documentId, title, folderId, records, direction, category, model, token, saveMode = 'sync' }) {
    const trimmedUrl = GasStorageClient._validateGasUrl(gasUrl);
    if (!records || records.length === 0) throw new Error('保存対象の確定翻訳レコードがありません。');

    const extractedFolderId = GasStorageClient.extractFolderId(folderId);
    const payload = {
      action: 'save',
      token: token || '',
      documentId: GasStorageClient.extractDocId(documentId),
      title: title || '',
      folderId: extractedFolderId,
      outputFolderId: extractedFolderId,
      model: model || DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL,
      direction: direction || 'AUTO',
      category: category || 'HKC',
      saveMode,
      records
    };

    let res;
    try {
      res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }, 40000);
    } catch (netErr) {
      if (netErr.name === 'AbortError') {
        throw new Error('GAS保存が40秒以内に完了しませんでした（タイムアウト）。通信環境またはGoogle Apps Scriptの実行状況を確認してください。');
      }
      throw new Error('GASサーバーと通信できませんでした (CORSまたは接続遮断)。GASのデプロイで「アクセスできるユーザー: 全員」が設定されているか確認してください。');
    }

    if (!res.ok) {
      throw new Error(`GAS通信HTTPエラー: ${res.status}`);
    }

    const data = GasStorageClient._parseGasJson(await res.text());
    if (data.status === 'error') {
      const err = new Error(data.message || 'GAS処理エラー');
      err.code = data.code;
      throw err;
    }
    return data;
  }
}

// ==========================================
// 10. LongFormUtteranceBuffer (Real-time Original + Long-Form Japanese Aggregator)
// ==========================================
class LongFormUtteranceBuffer {
  static PRESETS = Object.freeze({
    'long': {
      ja: { silenceMs: 4000, minCharsForSentenceEnd: 260, hardMaxChars: 520, maxWaitMs: 28000 },
      en: { silenceMs: 2000, minCharsForSentenceEnd: 80, hardMaxChars: 200, maxWaitMs: 15000 }
    },
    'extra-long': {
      ja: { silenceMs: 6000, minCharsForSentenceEnd: 420, hardMaxChars: 800, maxWaitMs: 45000 },
      en: { silenceMs: 2800, minCharsForSentenceEnd: 130, hardMaxChars: 300, maxWaitMs: 20000 }
    },
    'balanced': {
      ja: { silenceMs: 2200, minCharsForSentenceEnd: 120, hardMaxChars: 280, maxWaitMs: 16000 },
      en: { silenceMs: 1500, minCharsForSentenceEnd: 45, hardMaxChars: 150, maxWaitMs: 12000 }
    }
  });

  constructor({ onFlush, onDisplayUpdate, onLog } = {}) {
    this.onFlush = onFlush || null;
    this.onDisplayUpdate = onDisplayUpdate || null;
    this.onLog = onLog || null;

    this.mode = 'long';
    this.direction = 'auto';

    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this.bufferTargetLang = 'ja';
    this._afterTurnComplete = false;

    this.silenceTimer = null;
    this.maxWaitTimer = null;
  }

  setConfig({ mode, direction }) {
    if (mode && LongFormUtteranceBuffer.PRESETS[mode]) {
      this.mode = mode;
    }
    if (direction) {
      this.direction = direction;
    }
    this._notifyDisplay();
  }

  hasPendingText() {
    return (this.committedText + this.currentInterim).trim().length > 0;
  }

  getPendingText() {
    const committed = this.committedText.trim();
    const interim = this.currentInterim.trim();
    if (committed && interim) return `${committed} ${interim}`;
    return committed || interim || '';
  }

  reset() {
    this._clearTimers();
    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this.bufferTargetLang = this.direction === 'ja-to-en' ? 'en' : 'ja';
    this._afterTurnComplete = false;
    this._notifyDisplay();
  }

  markTurnComplete() {
    this._afterTurnComplete = true;
  }

  _clearTimers() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  _getPresetConfig(targetLang) {
    const preset = LongFormUtteranceBuffer.PRESETS[this.mode] || LongFormUtteranceBuffer.PRESETS.long;
    return targetLang === 'en' ? preset.en : preset.ja;
  }

  _resolveTargetLang(text, langCode) {
    if (this.direction === 'ja-to-en') return 'en';
    if (this.direction === 'en-to-ja' || this.direction === 'bn-to-ja' || this.direction === 'hi-to-ja') return 'ja';
    return detectLanguage4(text, langCode) === 'ja' ? 'en' : 'ja';
  }

  _isClearLanguageGroupSwitch(incomingText, langCode) {
    if (this.direction !== 'auto' || !this.committedText.trim()) return false;
    const clean = incomingText.trim();
    if (!clean) return false;

    const kanaCount = (clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
    const indicCount = (clean.match(/[\u0900-\u097F\u0980-\u09FF]/g) || []).length;
    const latinWords = clean.match(/[A-Za-z]{2,}/g) || [];
    const latinLetters = (clean.match(/[A-Za-z]/g) || []).length;

    if (this.bufferTargetLang === 'ja') {
      if (kanaCount >= 2) return true;
      if (langCode && String(langCode).toLowerCase().startsWith('ja') && /[\u4E00-\u9FFF]/.test(clean)) return true;
      return false;
    }
    if (indicCount >= 2) return true;
    return kanaCount === 0 && (latinWords.length >= 3 || latinLetters >= 18);
  }

  _joinText(base, addition, forceSpaceIfNonCJK = false) {
    if (!addition) return base;
    if (!base) return addition.replace(/^\s+/, '');

    const trimmedBase = base.trim();
    const trimmedAdd = addition.trim();
    if (trimmedBase.length >= 6 && trimmedAdd.startsWith(trimmedBase)) {
      return trimmedAdd;
    }

    if (/^\s/.test(addition) || /\s$/.test(base)) {
      return (base + addition).replace(/[ \t]{2,}/g, ' ');
    }

    const lastChar = base.slice(-1);
    const firstChar = addition.charAt(0);
    const isCJK = (ch) => /[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/.test(ch);
    const startsWithClosingPunct = /^[.,?!;:)\]'""’”）。、！？\u0964\u0965]/.test(firstChar);

    if (startsWithClosingPunct || (isCJK(lastChar) && isCJK(firstChar))) {
      return base + addition;
    }

    const endsWithPunct = /[.?!,;:\u0964\u0965]$/.test(lastChar);
    if (endsWithPunct || forceSpaceIfNonCJK) {
      return base + ' ' + addition;
    }
    return base + addition;
  }

  pushInterim(interimText) {
    this.currentInterim = String(interimText || '');
    if (this.hasPendingText()) {
      this._scheduleSilenceTimer();
    }
    this._notifyDisplay();
  }

  pushFinal(rawText, langCode = null, options = {}) {
    if (typeof rawText !== 'string' || rawText.length === 0) return;

    if (this._isClearLanguageGroupSwitch(rawText, langCode)) {
      this._emitText(this.committedText, this.bufferLangHint, 'language-switch');
      this.committedText = '';
      this.bufferLangHint = null;
      this._clearTimers();
    }

    const wasEmpty = this.committedText.trim().length === 0;
    const forceSpace = !!options.fromWebSpeech || this._afterTurnComplete;
    this._afterTurnComplete = false;

    this.currentInterim = '';
    this.committedText = this._joinText(this.committedText, rawText, forceSpace);

    if (wasEmpty && this.committedText.trim().length > 0) {
      this.bufferLangHint = langCode || detectLanguage4(this.committedText);
      this.bufferTargetLang = this._resolveTargetLang(this.committedText, langCode);
      this._scheduleMaxWaitTimer();
    } else if (!this.bufferLangHint && langCode) {
      this.bufferLangHint = langCode;
    }

    this._tryEmitReadyChunks();

    if (this.committedText.trim().length > 0) {
      this._scheduleSilenceTimer();
      if (!this.maxWaitTimer) {
        this._scheduleMaxWaitTimer();
      }
    } else {
      this._clearTimers();
    }

    this._notifyDisplay();
  }

  _tryEmitReadyChunks() {
    const cfg = this._getPresetConfig(this.bufferTargetLang);

    while (this.committedText.trim().length >= cfg.minCharsForSentenceEnd) {
      const text = this.committedText.trim();
      const minSplit = Math.floor(cfg.minCharsForSentenceEnd * 0.55);

      let splitIdx = this._findSplitIndex(text, minSplit, text.length, true);
      if (splitIdx <= 0 && text.length >= cfg.hardMaxChars) {
        splitIdx = this._findSplitIndex(text, Math.floor(cfg.hardMaxChars * 0.5), cfg.hardMaxChars, false);
      }
      if (splitIdx <= 0) break;

      const chunk = text.slice(0, splitIdx).trim();
      const remainder = text.slice(splitIdx).trim();
      if (!chunk) break;

      this._emitText(chunk, this.bufferLangHint, 'length-boundary');
      this.committedText = remainder;

      if (!remainder) {
        this.bufferLangHint = null;
        this._clearTimers();
        break;
      }

      this.bufferLangHint = detectLanguage4(remainder);
      this.bufferTargetLang = this._resolveTargetLang(remainder, null);
      if (this.maxWaitTimer) {
        clearTimeout(this.maxWaitTimer);
        this.maxWaitTimer = null;
      }
      this._scheduleMaxWaitTimer();
    }
  }

  _findSplitIndex(text, minIdx, maxIdx, sentenceOnly) {
    const slice = text.slice(0, Math.min(text.length, maxIdx));

    const sentenceRegex = /([.?!](?=\s|$)|[。！？\u0964\u0965])/g;
    let lastSentenceEnd = -1;
    let m;
    while ((m = sentenceRegex.exec(slice)) !== null) {
      const endPos = m.index + m[0].length;
      if (endPos >= minIdx) lastSentenceEnd = endPos;
    }
    if (lastSentenceEnd !== -1) return lastSentenceEnd;
    if (sentenceOnly) return -1;

    const clauseRegex = /([,;](?=\s|$)|[、：；])/g;
    let lastClauseEnd = -1;
    while ((m = clauseRegex.exec(slice)) !== null) {
      const endPos = m.index + m[0].length;
      if (endPos >= minIdx) lastClauseEnd = endPos;
    }
    if (lastClauseEnd !== -1) return lastClauseEnd;

    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= minIdx) return lastSpace;

    return Math.min(text.length, maxIdx);
  }

  _scheduleSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.hasPendingText()) {
        this.flushAll('silence-timeout');
      }
    }, cfg.silenceMs);
  }

  _scheduleMaxWaitTimer() {
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.maxWaitTimer = setTimeout(() => {
      this.maxWaitTimer = null;
      const text = this.committedText.trim();
      if (text.length < 80) {
        if (text.length > 0) this._scheduleMaxWaitTimer();
        return;
      }
      const splitIdx = this._findSplitIndex(text, Math.floor(text.length * 0.45), text.length, false);
      const chunk = text.slice(0, splitIdx).trim();
      const remainder = text.slice(splitIdx).trim();
      if (chunk) {
        this._emitText(chunk, this.bufferLangHint, 'max-wait');
        this.committedText = remainder;
        if (!remainder) {
          this.bufferLangHint = null;
          this._clearTimers();
        } else {
          this._scheduleMaxWaitTimer();
          this._scheduleSilenceTimer();
        }
        this._notifyDisplay();
      }
    }, cfg.maxWaitMs);
  }

  flushAll(reason = 'manual') {
    this._clearTimers();
    let combined = this.committedText;
    if (this.currentInterim && this.currentInterim.trim().length > 0) {
      combined = this._joinText(combined, this.currentInterim.trim(), true);
    }
    const finalChunk = combined.trim();
    const langHint = this.bufferLangHint || (finalChunk ? detectLanguage4(finalChunk) : null);

    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this._afterTurnComplete = false;

    if (finalChunk.length > 0) {
      this._emitText(finalChunk, langHint, reason);
    }
    this._notifyDisplay();
  }

  _emitText(text, langHint, reason) {
    if (!text || !text.trim()) return;
    if (this.onLog) {
      this.onLog('info', `[長文バッファ確定:${reason}] ${text.trim().length}文字を翻訳キューへ送信`);
    }
    if (this.onFlush) {
      this.onFlush(text.trim(), langHint);
    }
  }

  _notifyDisplay() {
    if (!this.onDisplayUpdate) return;
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.onDisplayUpdate({
      committed: this.committedText.trim(),
      interim: this.currentInterim.trim(),
      totalChars: (this.committedText + this.currentInterim).trim().length,
      targetLang: this.bufferTargetLang,
      silenceSec: (cfg.silenceMs / 1000).toFixed(1)
    });
  }
}

// ==========================================
// 11. Main Application Controller
// ==========================================
class App {
  constructor() {
    this.audioService = new AudioCaptureService();
    this.webSpeechService = new WebSpeechService();
    this.geminiClient = new GeminiLiveClient();
    this.geminiTextClient = new GeminiTextClient();
    this.geminiTextClient.onLogCallback = (type, msg) => this.log(type, msg);

    this.utteranceBuffer = new LongFormUtteranceBuffer({
      onFlush: (chunk, langCode) => this._handleFinalSpeech(chunk, langCode),
      onDisplayUpdate: (state) => this._renderLiveDisplay(state),
      onLog: (type, msg) => this.log(type, msg)
    });

    this.translationService = new TranslationService(this.geminiTextClient);
    this.translationService.onLogCallback = (type, msg) => this.log(type, msg);

    this.summaryService = new SummaryService(this.geminiTextClient);
    this.summaryService.onLogCallback = (type, msg) => this.log(type, msg);

    this.activeEngine = 'none';
    this.records = [];
    this.summaryHistory = [];
    this.currentSummaryId = null;
    this.savedRecordCount = 0;

    // State & concurrency locks
    this.hasUnsavedChanges = false;
    this.isRecording = false;
    this.isStarting = false;
    this.isPaused = false;
    this.isSummarizing = false;
    this.isSavingDocs = false;
    this.summaryBodyCollapsed = false;

    this._initElements();
    this._loadSettings();
    this._bindAllEvents();
    this._checkHashConfig();
    this._updateUIState();

    if (isIPadOrIOS()) {
      this.log('info', '📱 iPadOS / iOS 環境を検出しました。Web Audio 即時アンロック＆最適化マイク設定を適用しました。');
      const displayOption = this.elSelectAudioSource?.querySelector('option[value="display"]');
      if (displayOption) {
        displayOption.disabled = true;
        displayOption.textContent = 'タブ・PC音声 (PCのみ・iPad非対応)';
      }
    }

    this._summaryPreviewTimer = setInterval(() => this._updateSummaryTargetPreview(), 15000);
    this.log('info', `初期化完了 (v${APP_VERSION})。最適化アーキテクチャ・通信量半減・自動再接続・前文脈連動・任意範囲サマリーが有効です。`);
  }

  log(type, message) {
    if (!this.elDiagLog || !this.elDiagLogContainer) return;
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${time}] ${message}`;
    this.elDiagLog.appendChild(line);

    // 長時間稼働時のDOM肥大化を防止
    while (this.elDiagLog.childElementCount > DEFAULT_SETTINGS.MAX_LOG_LINES) {
      this.elDiagLog.removeChild(this.elDiagLog.firstElementChild);
    }
    this.elDiagLogContainer.scrollTop = this.elDiagLogContainer.scrollHeight;
  }

  _initElements() {
    const byId = (id) => document.getElementById(id);

    this.elStatusBadge = byId('connection-status');
    this.elStatusText = byId('status-text');
    this.elEngineBadge = byId('active-engine-badge');
    this.elBtnSettings = byId('btn-open-settings');

    this.elBtnToggleRecord = byId('btn-toggle-record');
    this.elBtnPauseRecord = byId('btn-pause-record');
    this.elSelectDirection = byId('select-direction');
    this.elSelectCategory = byId('select-category');
    this.elSelectChunkMode = byId('select-chunk-mode');
    this.elSelectContextWindow = byId('select-context-window');
    this.elSelectAudioSource = byId('select-audio-source');
    this.elSelectGain = byId('select-gain');
    this.elSelectDefaultGain = byId('select-default-gain');
    this.elBtnClearFeed = byId('btn-clear-feed');
    this.elBtnSaveDocs = byId('btn-save-docs');
    this.elSaveDocsText = byId('btn-save-docs-text');
    this.elUnsavedBadge = byId('unsaved-badge');

    this.elRadioDocModes = document.getElementsByName('doc-save-mode');
    this.elInputDocTitle = byId('input-doc-title');
    this.elInputDocId = byId('input-doc-id');
    this.elInputFolderId = byId('input-folder-id');
    this.elInputDefaultFolderId = byId('input-default-folder-id');
    this.elSavedFolderSep = byId('saved-folder-sep');
    this.elSavedFolderLink = byId('saved-folder-link');
    this.elSavedDocBanner = byId('saved-doc-banner');
    this.elSavedDocLink = byId('saved-doc-link');

    this.elLivePreview = byId('livePreview');
    this.elLiveText = byId('liveText');
    this.elLiveEngineTag = byId('liveEngineTag');
    this.elLiveBufferStatus = byId('liveBufferStatus');
    this.elBtnFlushNow = byId('btn-flush-now');
    this.elMeterBar = document.querySelector('.meter-bar');

    this.elToggleDiag = byId('toggle-diag');
    this.elDiagLogContainer = byId('diag-log-container');
    this.elDiagLog = byId('diag-log');

    this.elTranscriptList = byId('transcript-list');
    this.elEmptyState = byId('empty-state');
    this.elRecordCount = byId('record-count');
    this.elBtnCopyAll = byId('btn-copy-all');

    // Custom Prompt Panel
    this.elBtnTogglePromptPanel = byId('btn-toggle-prompt-panel');
    this.elPromptPanelBody = byId('prompt-panel-body');
    this.elPromptStatusBadge = byId('prompt-status-badge');
    this.elPromptToggleChevron = byId('prompt-toggle-chevron');
    this.elInputTranslationPrompt = byId('input-translation-prompt');
    this.elBtnClearTranslationPrompt = byId('btn-clear-translation-prompt');
    this.elPromptPresetBtns = document.querySelectorAll('.prompt-preset-btn');

    // Summary UI
    this.elSelectSummaryRange = byId('select-summary-range');
    this.elSummaryCustomWrapper = byId('summary-custom-wrapper');
    this.elInputSummaryCustomMin = byId('input-summary-custom-min');
    this.elSummaryTargetPreview = byId('summary-target-preview');
    this.elBtnGenerateSummary = byId('btn-generate-summary');
    this.elSummaryResultCard = byId('summary-result-card');
    this.elSummaryMetaBadge = byId('summary-meta-badge');
    this.elSelectSummaryHistory = byId('select-summary-history');
    this.elBtnCopySummary = byId('btn-copy-summary');
    this.elBtnToggleSummaryBody = byId('btn-toggle-summary-body');
    this.elBtnCloseSummary = byId('btn-close-summary');
    this.elSummaryResultBody = byId('summary-result-body');
    this.elSummaryContent = byId('summary-content');

    // Settings Modal
    this.elModal = byId('settings-modal');
    this.elBtnCloseModal = byId('btn-close-modal');
    this.elInputApiKey = byId('input-gemini-key');
    this.elBtnToggleKeyVis = byId('btn-toggle-key-vis');
    this.elSelectEngineMode = byId('select-engine-mode');
    this.elSelectLiveModel = byId('select-live-model');
    this.elInputSystemInstruction = byId('input-system-instruction');
    this.elBtnResetInstruction = byId('btn-reset-instruction');
    this.elInputGasUrl = byId('input-gas-url');
    this.elInputGasToken = byId('input-gas-token');
    this.elBtnTestGas = byId('btn-test-gas');
    this.elGasTestResult = byId('gas-test-result');
    this.elCheckAutoSave = byId('check-auto-save');
    this.elBtnSaveSettings = byId('btn-save-settings');

    this.elToastContainer = byId('toast-container');

    // QR Code Modal
    this.elBtnOpenQr = byId('btn-open-qr');
    this.elQrModal = byId('qr-modal');
    this.elBtnCloseQrModal = byId('btn-close-qr-modal');
    this.elBtnDoneQrModal = byId('btn-done-qr-modal');
    this.elQrCanvas = byId('qr-canvas');
    this.elQrDensityMeta = byId('qr-density-meta');
    this.elCheckQrIncludePrompts = byId('check-qr-include-prompts');
    this.elInputShareUrl = byId('input-share-url');
    this.elBtnCopyShareUrl = byId('btn-copy-share-url');
  }

  _loadSettings() {
    const K = ConfigManager.STORAGE_KEYS;
    this.apiKey = ConfigManager.get(K.API_KEY, '');
    this.gasUrl = ConfigManager.get(K.GAS_URL, '');
    this.gasToken = ConfigManager.get(K.GAS_TOKEN, '');
    this.audioSource = ConfigManager.get(K.AUDIO_SOURCE, 'mic');
    this.direction = ConfigManager.get(K.DIRECTION, 'auto');
    this.category = ConfigManager.get(K.CATEGORY, 'HKC');
    this.chunkMode = ConfigManager.get(K.CHUNK_MODE, 'long');

    const savedCtxWin = parseInt(ConfigManager.get(K.CONTEXT_WINDOW, '6'), 10);
    this.contextWindow = isNaN(savedCtxWin) ? 6 : savedCtxWin;

    this.translationCustomPrompt = ConfigManager.get(K.TRANSLATION_CUSTOM_PROMPT, '');
    this.promptPanelOpen = ConfigManager.get(K.TRANSLATION_PROMPT_OPEN, 'false') === 'true';

    this.summaryRange = ConfigManager.get(K.SUMMARY_RANGE, '5');
    const savedCustomMin = parseInt(ConfigManager.get(K.SUMMARY_CUSTOM_MIN, '5'), 10);
    this.summaryCustomMin = (!isNaN(savedCustomMin) && savedCustomMin >= 1 && savedCustomMin <= 360) ? savedCustomMin : 5;

    this.gain = ConfigManager.get(K.GAIN, '2.5');
    this.engineMode = ConfigManager.get(K.ENGINE_MODE, 'auto');
    this.liveModel = ConfigManager.get(K.LIVE_MODEL, DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL);
    this.systemInstruction = ConfigManager.get(K.SYSTEM_INSTRUCTION, DEFAULT_SYSTEM_INSTRUCTION);
    this.autoSave = ConfigManager.get(K.AUTO_SAVE, 'false') === 'true';
    this.docMode = ConfigManager.get(K.DOC_MODE, 'new');
    this.folderId = ConfigManager.get(K.FOLDER_ID, DEFAULT_SETTINGS.DEFAULT_FOLDER_ID);
    this.lastDocId = ConfigManager.get(K.LAST_DOC_ID, '');

    if (isIPadOrIOS() && this.audioSource === 'display') {
      this.audioSource = 'mic';
      ConfigManager.set(K.AUDIO_SOURCE, 'mic');
    }

    // Apply loaded values to DOM
    this.elInputApiKey.value = this.apiKey;
    this.elInputGasUrl.value = this.gasUrl;
    this.elInputGasToken.value = this.gasToken;
    if (this.elSelectAudioSource) this.elSelectAudioSource.value = this.audioSource;
    this.elSelectDirection.value = this.direction;
    if (this.elSelectCategory) this.elSelectCategory.value = this.category;
    if (this.elSelectChunkMode) this.elSelectChunkMode.value = this.chunkMode;
    if (this.elSelectContextWindow) this.elSelectContextWindow.value = String(this.contextWindow);
    if (this.elSelectGain) this.elSelectGain.value = this.gain;
    if (this.elSelectDefaultGain) this.elSelectDefaultGain.value = this.gain;
    this.elSelectEngineMode.value = this.engineMode;
    this.elSelectLiveModel.value = this.liveModel;
    if (this.elInputSystemInstruction) this.elInputSystemInstruction.value = this.systemInstruction;
    this.elCheckAutoSave.checked = this.autoSave;
    if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
    if (this.elInputDefaultFolderId) this.elInputDefaultFolderId.value = this.folderId;
    if (this.lastDocId) this.elInputDocId.value = this.lastDocId;

    this.audioService.setGain(this.gain);
    this.utteranceBuffer.setConfig({ mode: this.chunkMode, direction: this.direction });

    for (const radio of this.elRadioDocModes) {
      if (radio.value === this.docMode) radio.checked = true;
    }
    this._syncDocModeUI();

    if (this.elInputTranslationPrompt) {
      this.elInputTranslationPrompt.value = this.translationCustomPrompt;
    }
    this._syncPromptPanelUI();

    if (this.elSelectSummaryRange) this.elSelectSummaryRange.value = this.summaryRange;
    if (this.elInputSummaryCustomMin) this.elInputSummaryCustomMin.value = String(this.summaryCustomMin);
    this._syncSummaryRangeUI();
  }

  // ---- Modular Event Binding ----
  _bindAllEvents() {
    this._bindRecordingEvents();
    this._bindControlEvents();
    this._bindPromptEvents();
    this._bindSummaryEvents();
    this._bindModalEvents();
    this._bindGeminiClientCallbacks();

    const unlockAudioHandler = () => {
      try { this.audioService.unlockContext(); } catch (e) {}
    };
    document.addEventListener('touchstart', unlockAudioHandler, { once: true, passive: true });
    document.addEventListener('click', unlockAudioHandler, { once: true, passive: true });
    window.addEventListener('hashchange', () => this._checkHashConfig());
  }

  _bindRecordingEvents() {
    this.elBtnToggleRecord.addEventListener('click', () => {
      this.audioService.unlockContext();
      this.toggleRecording();
    });
    this.elBtnPauseRecord.addEventListener('click', () => this.togglePause());

    if (this.elBtnFlushNow) {
      this.elBtnFlushNow.addEventListener('click', () => {
        if (this.utteranceBuffer.hasPendingText()) {
          this.utteranceBuffer.flushAll('manual-button');
        }
      });
    }
  }

  _bindControlEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elSelectAudioSource?.addEventListener('change', (e) => {
      this.audioSource = e.target.value;
      ConfigManager.set(K.AUDIO_SOURCE, this.audioSource);
      this.log('info', `音源切り替え: ${this.audioSource === 'display' ? '🖥️ タブ・PC音声 (イヤホン再生音)' : '🎤 マイク入力'}`);
      this._updateUIState();
      if (this.isRecording) {
        this.showToast('音源設定を変更しました。再起動後に適用されます。', 'info');
      }
    });

    this.elSelectDirection.addEventListener('change', (e) => {
      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('direction-change');
      }
      this.direction = e.target.value;
      ConfigManager.set(K.DIRECTION, this.direction);
      this.geminiClient.setDirection(this.direction);
      this.webSpeechService.setDirection(this.direction);
      this.utteranceBuffer.setConfig({ mode: this.chunkMode, direction: this.direction });
      this.log('info', `翻訳方向変更: ${this.direction}`);
      if (this.isRecording) {
        this.showToast(
          this.activeEngine === 'gemini-live'
            ? '翻訳方向を変更し、認識言語設定を即時再適用しました。'
            : '翻訳方向が変更されました。次回発話から適用されます。',
          'info'
        );
      }
    });

    this.elSelectChunkMode?.addEventListener('change', (e) => {
      this.chunkMode = e.target.value;
      ConfigManager.set(K.CHUNK_MODE, this.chunkMode);
      this.utteranceBuffer.setConfig({ mode: this.chunkMode, direction: this.direction });
      this.log('info', `翻訳区切りモード変更: ${this.chunkMode}`);
      this.showToast('翻訳の区切り設定を変更しました。', 'info');
    });

    this.elSelectContextWindow?.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      this.contextWindow = isNaN(val) ? 6 : val;
      ConfigManager.set(K.CONTEXT_WINDOW, String(this.contextWindow));
      this.log('info', `翻訳時の前文脈参照件数を変更: ${this.contextWindow === 0 ? 'なし (独立翻訳)' : `直近${this.contextWindow}件`}`);
      this.showToast(
        this.contextWindow === 0
          ? '前文脈参照をオフ（独立翻訳）にしました。'
          : `直近 ${this.contextWindow} 件の前文脈を参照して翻訳します。`,
        'info'
      );
    });

    this.elSelectCategory?.addEventListener('change', (e) => {
      this.category = e.target.value;
      ConfigManager.set(K.CATEGORY, this.category);
      this.log('info', `監査分野変更: ${this.category}`);
    });

    this.elSelectGain?.addEventListener('change', (e) => {
      this.gain = e.target.value;
      ConfigManager.set(K.GAIN, this.gain);
      this.audioService.setGain(this.gain);
      this.log('info', `マイク集音感度変更: ${this.gain}x (遠距離ブースト適用)`);
      this.showToast(`マイク感度を ${this.gain}x に設定しました。`, 'info');
    });

    this.elBtnClearFeed.addEventListener('click', () => {
      if (this.records.length === 0) return;
      if (!confirm('タイムラインの翻訳履歴を全消去しますか？')) return;

      this.records = [];
      this.summaryHistory = [];
      this.currentSummaryId = null;
      this.savedRecordCount = 0;
      this.utteranceBuffer.reset();
      this.hasUnsavedChanges = false;
      this.elTranscriptList.innerHTML = '';
      this.elEmptyState.style.display = 'block';
      this.elRecordCount.textContent = '0 件の発話';
      if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'none';
      if (this.elSelectSummaryHistory) {
        this.elSelectSummaryHistory.innerHTML = '';
        this.elSelectSummaryHistory.style.display = 'none';
      }
      this._updateSummaryTargetPreview();
      this._updateUIState();
      this.showToast('全履歴をクリアしました。', 'info');
    });

    this.elBtnSaveDocs.addEventListener('click', () => this.saveToDocs(false));

    for (const radio of this.elRadioDocModes) {
      radio.addEventListener('change', (e) => {
        this.docMode = e.target.value;
        ConfigManager.set(K.DOC_MODE, this.docMode);
        this._syncDocModeUI();
      });
    }

    this.elInputDocId.addEventListener('input', (e) => {
      const sanitized = GasStorageClient.extractDocId(e.target.value);
      if (sanitized !== e.target.value) e.target.value = sanitized;
      this.hasUnsavedChanges = true;
      this._updateUIState();
    });

    this.elBtnCopyAll.addEventListener('click', () => this.copyAllTranscripts());

    this.elToggleDiag.addEventListener('click', () => {
      const isHidden = this.elDiagLogContainer.style.display === 'none';
      this.elDiagLogContainer.style.display = isHidden ? 'block' : 'none';
    });
  }

  _bindPromptEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elBtnTogglePromptPanel?.addEventListener('click', () => {
      this.promptPanelOpen = !this.promptPanelOpen;
      ConfigManager.set(K.TRANSLATION_PROMPT_OPEN, String(this.promptPanelOpen));
      this._syncPromptPanelUI();
    });

    this.elInputTranslationPrompt?.addEventListener('input', (e) => {
      this.translationCustomPrompt = e.target.value;
      ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, this.translationCustomPrompt);
      this._updatePromptStatusBadge();
    });

    this.elBtnClearTranslationPrompt?.addEventListener('click', () => {
      this.translationCustomPrompt = '';
      if (this.elInputTranslationPrompt) this.elInputTranslationPrompt.value = '';
      ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, '');
      this._updatePromptStatusBadge();
      this.log('info', '翻訳プロンプト追記をクリアしました（標準プロンプトのみに戻りました）。');
      this.showToast('追記プロンプトをクリアしました。', 'info');
    });

    this.elPromptPresetBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.preset;
        const presetText = TRANSLATION_PROMPT_PRESETS[presetKey];
        if (!presetText) return;
        this.translationCustomPrompt = presetText;
        if (this.elInputTranslationPrompt) {
          this.elInputTranslationPrompt.value = presetText;
          this.elInputTranslationPrompt.focus();
        }
        ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, presetText);
        this._updatePromptStatusBadge();
        this.log('info', `翻訳プロンプトプリセット適用: ${presetKey}`);
        this.showToast('翻訳ニュアンスのプリセットを反映しました（自由に編集・追記できます）。', 'success');
      });
    });
  }

  _bindSummaryEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elSelectSummaryRange?.addEventListener('change', (e) => {
      this.summaryRange = e.target.value;
      ConfigManager.set(K.SUMMARY_RANGE, this.summaryRange);
      this._syncSummaryRangeUI();
      if (this.summaryRange === 'custom' && this.elInputSummaryCustomMin) {
        this.elInputSummaryCustomMin.focus();
        this.elInputSummaryCustomMin.select();
      }
    });

    if (this.elInputSummaryCustomMin) {
      const updateCustomMin = () => {
        let val = parseInt(this.elInputSummaryCustomMin.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 360) val = 360;
        this.summaryCustomMin = val;
        ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(val));
        this._updateSummaryTargetPreview();
      };
      this.elInputSummaryCustomMin.addEventListener('input', updateCustomMin);
      this.elInputSummaryCustomMin.addEventListener('change', () => {
        updateCustomMin();
        this.elInputSummaryCustomMin.value = String(this.summaryCustomMin);
      });
      this.elInputSummaryCustomMin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          updateCustomMin();
          this.generateSummary();
        }
      });
    }

    this.elBtnGenerateSummary?.addEventListener('click', () => this.generateSummary());

    this.elSelectSummaryHistory?.addEventListener('change', (e) => {
      this.currentSummaryId = e.target.value;
      this._renderCurrentSummary();
    });

    this.elBtnCopySummary?.addEventListener('click', () => this.copyCurrentSummary());

    this.elBtnToggleSummaryBody?.addEventListener('click', () => {
      this.summaryBodyCollapsed = !this.summaryBodyCollapsed;
      if (this.elSummaryResultBody) {
        this.elSummaryResultBody.style.display = this.summaryBodyCollapsed ? 'none' : 'block';
      }
      this.elBtnToggleSummaryBody.textContent = this.summaryBodyCollapsed ? '▼ 開く' : '▲ 折りたたむ';
    });

    this.elBtnCloseSummary?.addEventListener('click', () => {
      if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'none';
    });
  }

  _bindModalEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    // Settings Modal
    this.elBtnSettings.addEventListener('click', () => this._openSettingsModal());
    this.elBtnCloseModal.addEventListener('click', () => this._closeSettingsModal());
    this.elModal.addEventListener('click', (e) => {
      if (e.target === this.elModal) this._closeSettingsModal();
    });

    this.elBtnToggleKeyVis.addEventListener('click', () => {
      const isHidden = this.elInputApiKey.type === 'password';
      this.elInputApiKey.type = isHidden ? 'text' : 'password';
      this.elBtnToggleKeyVis.textContent = isHidden ? '非表示' : '表示';
    });

    this.elBtnResetInstruction?.addEventListener('click', () => {
      if (this.elInputSystemInstruction) {
        this.elInputSystemInstruction.value = DEFAULT_SYSTEM_INSTRUCTION;
        this.showToast('systemInstruction を初期値にリセットしました。', 'info');
      }
    });

    this.elBtnSaveSettings.addEventListener('click', () => {
      this.apiKey = this.elInputApiKey.value.trim();
      this.gasUrl = this.elInputGasUrl.value.trim();
      this.gasToken = this.elInputGasToken.value.trim();
      this.engineMode = this.elSelectEngineMode.value;
      this.liveModel = this.elSelectLiveModel.value;
      this.autoSave = this.elCheckAutoSave.checked;

      if (this.elSelectDefaultGain) {
        this.gain = this.elSelectDefaultGain.value;
        ConfigManager.set(K.GAIN, this.gain);
        if (this.elSelectGain) this.elSelectGain.value = this.gain;
        this.audioService.setGain(this.gain);
      }
      if (this.elInputSystemInstruction) {
        this.systemInstruction = this.elInputSystemInstruction.value.trim() || DEFAULT_SYSTEM_INSTRUCTION;
        ConfigManager.set(K.SYSTEM_INSTRUCTION, this.systemInstruction);
      }
      if (this.elInputDefaultFolderId) {
        this.folderId = GasStorageClient.extractFolderId(this.elInputDefaultFolderId.value.trim()) || DEFAULT_SETTINGS.DEFAULT_FOLDER_ID;
        ConfigManager.set(K.FOLDER_ID, this.folderId);
        if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
      }

      ConfigManager.set(K.API_KEY, this.apiKey);
      ConfigManager.set(K.GAS_URL, this.gasUrl);
      ConfigManager.set(K.GAS_TOKEN, this.gasToken);
      ConfigManager.set(K.ENGINE_MODE, this.engineMode);
      ConfigManager.set(K.LIVE_MODEL, this.liveModel);
      ConfigManager.set(K.AUTO_SAVE, String(this.autoSave));

      this._closeSettingsModal();
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
          this.elGasTestResult.textContent = `✓ 接続成功 (v${res.version || APP_VERSION})${authNote}`;
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

    // QR Code Modal
    this.elBtnOpenQr?.addEventListener('click', () => this._openQrModal());
    this.elCheckQrIncludePrompts?.addEventListener('change', () => this._renderQrCode());
    this.elBtnCloseQrModal?.addEventListener('click', () => this._closeQrModal());
    this.elBtnDoneQrModal?.addEventListener('click', () => this._closeQrModal());
    this.elQrModal?.addEventListener('click', (e) => {
      if (e.target === this.elQrModal) this._closeQrModal();
    });

    this.elBtnCopyShareUrl?.addEventListener('click', () => {
      if (!this.elInputShareUrl.value) return;
      this.copyToClipboard(this.elInputShareUrl.value)
        .then(() => this.showToast('スマホ連携用URLをクリップボードにコピーしました。', 'info'))
        .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
    });

    // Close open card action dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-menu')) {
        this._closeAllCardMenus();
      }
    });

    // Consolidated Escape key handler for all modals & card menus
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.elModal?.style.display === 'flex') this._closeSettingsModal();
      if (this.elQrModal?.style.display === 'flex') this._closeQrModal();
      this._closeAllCardMenus();
    });
  }

  _bindGeminiClientCallbacks() {
    this.geminiClient.onLogCallback = (type, msg) => this.log(type, msg);
    this.geminiClient.onErrorCallback = (err) => this.showToast(err, 'error');

    this.geminiClient.onReconnectingCallback = (attempt, maxAttempts, _delayMs, code) => {
      if (!this.isRecording) return;
      this._updateStatus('reconnecting', `再接続中 (${attempt}/${maxAttempts})...`);
      if (attempt === 1) {
        this.showToast(`回線が一時切断されました (Code: ${code})。録音を維持したまま自動再接続を試行します...`, 'warning');
      }
    };

    this.geminiClient.onReconnectedCallback = (attempt) => {
      if (!this.isRecording) return;
      this._updateStatus(this.isPaused ? 'paused' : 'recording');
      this.showToast(`音声認識サーバーへ自動再接続しました (${attempt}回目で復帰)。`, 'success');
    };

    this.geminiClient.onDisconnectCallback = (code, reason, exhausted) => {
      this.log('warn', `セッション終了切断: Code ${code}${reason ? ` (${reason})` : ''}`);
      if (exhausted) {
        this.showToast(`回線が復旧せず自動再接続の上限に達したため録音を停止しました (Code: ${code})。`, 'error');
      } else if (code === 1007 || code === 1008) {
        this.showToast(`認証または設定エラーのため録音を停止しました (Code: ${code})。APIキーを確認してください。`, 'error');
      }
      this.stopRecording();
    };

    this.geminiClient.onInterimCallback = (text) => {
      this.utteranceBuffer.pushInterim(text);
    };
    this.geminiClient.onFinalCallback = (rawFinalText, langCode) => {
      this.utteranceBuffer.pushFinal(rawFinalText, langCode, { fromWebSpeech: false });
    };
    this.geminiClient.onTurnCompleteCallback = () => {
      this.utteranceBuffer.markTurnComplete();
    };
  }

  // ---- UI Sync Helpers ----
  _syncDocModeUI() {
    const isExisting = this.docMode === 'existing';
    this.elInputDocTitle.style.display = isExisting ? 'none' : 'block';
    if (this.elInputFolderId) this.elInputFolderId.style.display = isExisting ? 'none' : 'block';
    this.elInputDocId.style.display = isExisting ? 'block' : 'none';
  }

  _syncPromptPanelUI() {
    if (this.elPromptPanelBody) {
      this.elPromptPanelBody.style.display = this.promptPanelOpen ? 'flex' : 'none';
    }
    this.elBtnTogglePromptPanel?.setAttribute('aria-expanded', String(this.promptPanelOpen));
    if (this.elPromptToggleChevron) {
      this.elPromptToggleChevron.textContent = this.promptPanelOpen ? '▲ 閉じる' : '▼ 開く';
    }
    this._updatePromptStatusBadge();
  }

  _updatePromptStatusBadge() {
    if (!this.elPromptStatusBadge) return;
    const len = (this.translationCustomPrompt || '').trim().length;
    this.elPromptStatusBadge.textContent = len > 0 ? `追記適用中 (${len}文字)` : '標準のみ';
    this.elPromptStatusBadge.className = len > 0 ? 'tag prompt-status-badge is-active' : 'tag prompt-status-badge';
  }

  _syncSummaryRangeUI() {
    if (this.elSummaryCustomWrapper) {
      this.elSummaryCustomWrapper.style.display = this.summaryRange === 'custom' ? 'inline-flex' : 'none';
    }
    this._updateSummaryTargetPreview();
  }

  // ---- Summary Management ----
  _getSummaryLookbackSpec() {
    if (this.summaryRange === 'all') {
      return { mode: 'all', minutes: null, label: 'セッション全体' };
    }
    const rawVal = this.summaryRange === 'custom'
      ? (this.elInputSummaryCustomMin ? this.elInputSummaryCustomMin.value : this.summaryCustomMin)
      : this.summaryRange;
    const parsed = parseInt(rawVal, 10);
    const minutes = (!isNaN(parsed) && parsed >= 1) ? Math.min(360, parsed) : 5;
    return { mode: 'minutes', minutes, label: `直近${minutes}分` };
  }

  _getRecordTimestampMs(record) {
    if (record && typeof record.createdAt === 'number' && !isNaN(record.createdAt)) {
      return record.createdAt;
    }
    if (record && typeof record.time === 'string') {
      const m = record.time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) {
        const d = new Date();
        d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10), 0);
        return d.getTime();
      }
    }
    return Date.now();
  }

  _collectRecordsForSummary(nowMs = Date.now()) {
    const spec = this._getSummaryLookbackSpec();
    const matchedRecords = spec.mode === 'all'
      ? [...this.records]
      : this.records.filter((r) => this._getRecordTimestampMs(r) >= nowMs - spec.minutes * 60 * 1000);
    const pendingText = this.utteranceBuffer ? this.utteranceBuffer.getPendingText() : '';
    return {
      spec,
      records: matchedRecords,
      pendingText,
      totalCount: matchedRecords.length + (pendingText ? 1 : 0)
    };
  }

  _updateSummaryTargetPreview() {
    if (!this.elSummaryTargetPreview) return;
    const { records, pendingText } = this._collectRecordsForSummary();
    const count = records.length;
    const hasPending = Boolean(pendingText);
    if (count > 0 || hasPending) {
      this.elSummaryTargetPreview.textContent = hasPending ? `対象: ${count}件 (+認識中)` : `対象: ${count}件`;
      this.elSummaryTargetPreview.className = 'tag summary-target-badge has-items';
    } else {
      this.elSummaryTargetPreview.textContent = '対象: 0件';
      this.elSummaryTargetPreview.className = 'tag summary-target-badge';
    }
  }

  async generateSummary() {
    if (this.isSummarizing) return;

    if (!this.apiKey) {
      this.showToast('サマリー生成には Gemini API キーが必要です。', 'warning');
      this._openSettingsModal();
      return;
    }

    const nowMs = Date.now();
    const { spec, records, pendingText, totalCount } = this._collectRecordsForSummary(nowMs);

    if (totalCount === 0) {
      const hint = this.records.length > 0
        ? `（セッション全体には ${this.records.length} 件あります。対象範囲を広げてお試しください）`
        : '';
      this.showToast(`${spec.label}以内にサマリー対象の発話がありません${hint}`, 'warning');
      return;
    }

    this.isSummarizing = true;
    this.summaryBodyCollapsed = false;
    if (this.elBtnGenerateSummary) {
      this.elBtnGenerateSummary.disabled = true;
      this.elBtnGenerateSummary.textContent = '⏳ サマリー生成中...';
    }
    if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'flex';
    if (this.elSummaryResultBody) this.elSummaryResultBody.style.display = 'block';
    if (this.elBtnToggleSummaryBody) this.elBtnToggleSummaryBody.textContent = '▲ 折りたたむ';
    if (this.elSummaryMetaBadge) {
      this.elSummaryMetaBadge.textContent = `${spec.label} / ${records.length}件${pendingText ? '+進行中' : ''} を集計中...`;
    }
    if (this.elSummaryContent) {
      this.elSummaryContent.className = 'summary-content is-loading';
      this.elSummaryContent.textContent = `⏳ ${spec.label}の会話内容を分析し、日本語サマリーを生成しています...`;
    }

    const endTimeStr = new Date(nowMs).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const startTimeStr = records.length > 0 ? (records[0].time || endTimeStr) : endTimeStr;
    this.log('info', `会話サマリー生成開始 (範囲: ${spec.label}, 対象: ${records.length}件${pendingText ? '+認識中1件' : ''})`);

    try {
      const result = await this.summaryService.generateSummary({
        records,
        pendingText,
        rangeLabel: spec.mode === 'all' ? `セッション全体 (${startTimeStr}〜${endTimeStr})` : `${spec.label} (${startTimeStr}〜${endTimeStr})`,
        category: this.category,
        customPrompt: this.translationCustomPrompt,
        apiKey: this.apiKey
      });

      const entry = {
        id: `sum_${nowMs}`,
        generatedAt: endTimeStr,
        rangeLabel: spec.label,
        timeSpan: `${startTimeStr}〜${endTimeStr}`,
        count: records.length,
        hasPending: Boolean(pendingText),
        markdown: result.summary,
        model: result.model
      };

      this.summaryHistory.unshift(entry);
      this.currentSummaryId = entry.id;
      this._refreshSummaryHistorySelect();
      this._renderCurrentSummary();
      this.showToast(`${spec.label}のサマリーを出力しました！`, 'success');
    } catch (err) {
      console.error('Summary generation failed:', err);
      this.log('error', `サマリー生成失敗: ${err.message}`);
      if (this.elSummaryContent) {
        this.elSummaryContent.className = 'summary-content';
        this.elSummaryContent.textContent = `⚠️ サマリー生成に失敗しました: ${err.message}`;
      }
      this.showToast('サマリー生成エラー: ' + err.message, 'error');
    } finally {
      this.isSummarizing = false;
      if (this.elBtnGenerateSummary) {
        this.elBtnGenerateSummary.disabled = false;
        this.elBtnGenerateSummary.textContent = '✨ サマリー出力';
      }
    }
  }

  _refreshSummaryHistorySelect() {
    if (!this.elSelectSummaryHistory) return;
    if (this.summaryHistory.length <= 1) {
      this.elSelectSummaryHistory.style.display = 'none';
      return;
    }
    this.elSelectSummaryHistory.innerHTML = '';
    for (const s of this.summaryHistory) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.generatedAt} (${s.rangeLabel} / ${s.count}件)`;
      if (s.id === this.currentSummaryId) opt.selected = true;
      this.elSelectSummaryHistory.appendChild(opt);
    }
    this.elSelectSummaryHistory.style.display = 'inline-block';
  }

  _renderCurrentSummary() {
    const entry = this.summaryHistory.find((s) => s.id === this.currentSummaryId) || this.summaryHistory[0];
    if (!entry) return;
    if (this.elSummaryMetaBadge) {
      this.elSummaryMetaBadge.textContent = `${entry.rangeLabel} (${entry.timeSpan} / ${entry.count}件${entry.hasPending ? '+進行中' : ''})`;
    }
    if (this.elSummaryContent) {
      this.elSummaryContent.className = 'summary-content';
      this.elSummaryContent.innerHTML = this._renderSummaryMarkdown(entry.markdown);
    }
  }

  _renderSummaryMarkdown(md) {
    const lines = String(md || '').split(/\r?\n/);
    const htmlParts = [];
    let inList = false;

    const formatInline = (text) => this._escapeHTML(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const closeListIfOpen = () => {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeListIfOpen();
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        closeListIfOpen();
        htmlParts.push(`<h4>${formatInline(line.replace(/^#{1,4}\s+/, ''))}</h4>`);
      } else if (/^([-*•・]|\d+\.)\s+/.test(line)) {
        if (!inList) {
          htmlParts.push('<ul>');
          inList = true;
        }
        htmlParts.push(`<li>${formatInline(line.replace(/^([-*•・]|\d+\.)\s+/, ''))}</li>`);
      } else {
        closeListIfOpen();
        htmlParts.push(`<p>${formatInline(line)}</p>`);
      }
    }
    closeListIfOpen();
    return htmlParts.join('');
  }

  copyCurrentSummary() {
    const entry = this.summaryHistory.find((s) => s.id === this.currentSummaryId) || this.summaryHistory[0];
    if (!entry) {
      this.showToast('コピーするサマリーがありません。', 'warning');
      return;
    }
    const header = `## 会話サマリー [${entry.rangeLabel} / ${entry.timeSpan} / ${entry.count}件 / 分野: ${this.category}]\n\n`;
    this.copyToClipboard(header + entry.markdown)
      .then(() => this.showToast('サマリーをMarkdown形式でコピーしました。', 'info'))
      .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
  }

  // ---- Recording Lifecycle ----
  async toggleRecording() {
    if (this.isStarting) return;
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (this.isStarting || this.isRecording) return;

    if (window.location.protocol === 'file:') {
      this.log('error', 'file:// プロトコルではブラウザのマイク機能が無効化されます。HTTPS または http://localhost 上でアクセスしてください。');
      this.showToast('file:// ではマイクが動作しません。ローカルサーバーまたはGitHub Pagesで開いてください。', 'error');
      return;
    }

    if (!this.apiKey) {
      this.showToast('Gemini API キーを設定してください。', 'warning');
      this._openSettingsModal();
      return;
    }

    this.isStarting = true;
    this.elBtnToggleRecord.disabled = true;
    this.log('info', `=== 翻訳セッション開始 (モード: ${this.engineMode}) ===`);

    try {
      this._updateStatus('connecting');
      let liveConnected = false;

      if (this.engineMode === 'auto' || this.engineMode === 'gemini-live') {
        try {
          this.log('info', 'Gemini Live WebSocket へ接続試行中...');
          await this.geminiClient.connect(this.apiKey, this.direction, this.liveModel, this.systemInstruction);

          const isDisplay = this.audioSource === 'display';
          this.log('info', isDisplay ? '🖥️ タブ・PC音声キャプチャ開始 (16kHz PCM)...' : '🎤 マイク音声取得開始 (Anti-Aliased 16kHz)...');
          if (isDisplay) {
            this.showToast('共有ウィンドウで「タブの音声も共有」にチェックを入れてください。', 'info');
          }
          await this.audioService.start(
            (chunk) => this.geminiClient.sendAudioChunk(chunk),
            (volume) => this._updateMeter(volume),
            this.audioSource,
            () => {
              this.log('info', 'ユーザーにより画面・音声共有が停止されました。');
              this.stopRecording();
            }
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

          if (this.engineMode === 'gemini-live') throw liveErr;
          this.log('info', '自動フォールバック: ブラウザ標準音声認識 (Web Speech API) を起動します...');
        }
      }

      if (!liveConnected) {
        if (this.audioSource === 'display') {
          throw new Error('タブ・PC音声キャプチャは Gemini Live API で動作します。Gemini APIキーおよびネットワーク設定をご確認ください。');
        }
        if (!this.webSpeechService.isSupported()) {
          throw new Error('ブラウザの音声認識APIが利用できません。Chrome または Edge でアクセスしてください。');
        }

        this.webSpeechService.start(
          this.direction,
          (interim) => this.utteranceBuffer.pushInterim(interim),
          (finalText, lang) => this.utteranceBuffer.pushFinal(finalText, lang, { fromWebSpeech: true }),
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
      this.utteranceBuffer.setConfig({ mode: this.chunkMode, direction: this.direction });
      this.utteranceBuffer.reset();
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
    } finally {
      this.isStarting = false;
      this.elBtnToggleRecord.disabled = false;
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

    this.utteranceBuffer?.flushAll('stop-recording');
    this.isRecording = false;
    this.isPaused = false;
    this.activeEngine = 'none';
    this.elLivePreview.style.display = 'none';
    this._updateMeter(0);
    this._updateStatus('idle');
    this._updateUIState();
    this.log('info', 'セッション停止完了。');
    this.showToast('翻訳セッションを停止しました。', 'info');

    if (this.autoSave && this.hasUnsavedChanges && this.gasUrl) {
      await this.saveToDocs(true);
    }
  }

  togglePause() {
    if (!this.isRecording) return;

    if (this.isPaused) {
      if (this.activeEngine === 'gemini-live') this.audioService.resume();
      else if (this.activeEngine === 'web-speech') this.webSpeechService.resume();

      this.isPaused = false;
      this.elLivePreview.style.display = 'flex';
      this.utteranceBuffer._notifyDisplay();
      this._updateStatus('recording');
      this.showToast('翻訳を再開しました。', 'info');
    } else {
      if (this.activeEngine === 'gemini-live') this.audioService.pause();
      else if (this.activeEngine === 'web-speech') this.webSpeechService.pause();

      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('pause-recording');
      }
      this.isPaused = true;
      this.utteranceBuffer._notifyDisplay();
      this._updateStatus('paused');
      this.showToast('翻訳を一時停止しました。', 'warning');
    }
    this._updateUIState();
  }

  _updateMeter(volume) {
    if (!this.elMeterBar) return;
    this.elMeterBar.style.width = `${Math.min(100, Math.round(volume * 400))}%`;
  }

  _renderLiveDisplay({ committed, interim, totalChars, targetLang, silenceSec }) {
    if (!this.elLiveText) return;
    const hasText = Boolean(committed || interim);

    if (this.elBtnFlushNow) {
      this.elBtnFlushNow.disabled = !hasText;
    }

    if (this.elLiveBufferStatus) {
      if (!hasText) {
        this.elLiveBufferStatus.textContent = this.isPaused ? '一時停止中' : '発話待機中';
        this.elLiveBufferStatus.className = 'tag buffer-status';
      } else if (targetLang === 'ja') {
        this.elLiveBufferStatus.textContent = `原語蓄積中 ${totalChars}文字（無音${silenceSec}秒 or 文末で長文日本語訳）`;
        this.elLiveBufferStatus.className = 'tag buffer-status is-buffering';
      } else {
        this.elLiveBufferStatus.textContent = `原語蓄積中 ${totalChars}文字（無音${silenceSec}秒で英訳）`;
        this.elLiveBufferStatus.className = 'tag buffer-status is-buffering';
      }
    }

    if (!hasText) {
      this.elLiveText.className = 'live-text live-placeholder';
      this.elLiveText.textContent = this.isRecording
        ? (this.isPaused ? '一時停止中 (音声を認識しません)' : '話しかけてください...')
        : 'マイクを開始すると、リアルタイムの原語プレビューが表示されます...';
      this._updateSummaryTargetPreview();
      return;
    }

    this.elLiveText.className = 'live-text';
    const parts = [];
    if (committed) parts.push(`<span class="live-committed">${this._escapeHTML(committed)}</span>`);
    if (interim) parts.push(`<span class="live-interim">${this._escapeHTML(interim)}</span>`);
    this.elLiveText.innerHTML = parts.join(committed && interim ? ' ' : '');
    this.elLiveText.scrollTop = this.elLiveText.scrollHeight;
    this._updateSummaryTargetPreview();
  }

  // ---- Transcript & Translation Management ----
  _getRecentContext(targetRecordId = null) {
    const windowSize = Number(this.contextWindow);
    if (!windowSize || windowSize <= 0) return [];

    let priorRecords = this.records;
    if (targetRecordId) {
      const targetIdx = this.records.findIndex((r) => r.id === targetRecordId);
      priorRecords = targetIdx !== -1
        ? this.records.slice(0, targetIdx)
        : this.records.filter((r) => r.id !== targetRecordId);
    }

    return priorRecords
      .filter((r) => r && ((r.originalText && r.originalText.trim()) || (r.translatedText && r.translatedText.trim())))
      .slice(-windowSize)
      .map((r) => {
        const hasValidTranslation =
          !r.isTranslating &&
          r.translatedText &&
          r.translatedText.trim() !== '' &&
          !r.translatedText.startsWith('【翻訳');
        return {
          time: r.time || '',
          speaker: r.speaker || '',
          speakerLang: r.speakerLang || '',
          original: r.originalText || '',
          translated: hasValidTranslation ? r.translatedText : ''
        };
      });
  }

  getFinalizedRecords() {
    return this.records.filter((r) => !r.isTranslating && r.translatedText && r.translatedText.trim() !== '');
  }

  _handleFinalSpeech(finalText, langCode) {
    if (!finalText || finalText.trim() === '') return;

    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const recordId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const fixedLangMap = { 'en-to-ja': 'en', 'ja-to-en': 'ja', 'bn-to-ja': 'bn', 'hi-to-ja': 'hi' };
    const detectedLang = fixedLangMap[this.direction] || detectLanguage4(finalText, langCode);
    const initialSpeaker = detectedLang === 'ja' ? ROLES[0] : ROLES[1];
    const engineLabel = this.activeEngine === 'gemini-live' ? 'Gemini Live' : 'Web Speech';

    const record = {
      id: recordId,
      time: timestamp,
      createdAt: Date.now(),
      speaker: initialSpeaker,
      speakerLang: detectedLang,
      originalText: finalText,
      translatedText: '',
      engine: engineLabel,
      direction: this.direction,
      category: this.category,
      isTranslating: true
    };

    this.records.push(record);
    this.hasUnsavedChanges = true;
    this._appendSingleCard(record);
    this._updateSummaryTargetPreview();
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
      (id, transResult) => this._onTranslationComplete(id, transResult),
      () => this._getRecentContext(recordId),
      this.translationCustomPrompt
    );
  }

  _closeAllCardMenus(exceptCard = null) {
    if (!this.elTranscriptList) return;
    const openCards = this.elTranscriptList.querySelectorAll('.card.transcript-item.menu-open');
    openCards.forEach((openCard) => {
      if (openCard === exceptCard) return;
      openCard.classList.remove('menu-open');
      const trigger = openCard.querySelector('.card-menu-btn');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

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
    const speakerShort = getSpeakerShortLabel(item.speaker);
    const langFullName = getLanguageDisplayName(item.speakerLang);
    const engineFull = item.engine || 'Gemini Live';
    const engineShort = getEngineShortLabel(engineFull);

    card.innerHTML = `
      <div class="meta">
        <div class="meta-left">
          <span class="card-time"><span class="time-icon">🕒 </span>${this._escapeHTML(item.time)}</span>
          <span id="${item.id}_spk" class="tag speaker ${speakerClass}" title="${this._escapeHTML(item.speaker || '発話')}（クリックで話者切替）">${this._escapeHTML(speakerShort)}</span>
          <span id="${item.id}_lang" class="tag lang-badge lang-${item.speakerLang}" title="${this._escapeHTML(langFullName)}">${getLanguageBadge(item.speakerLang)}</span>
          <span class="tag engine" title="${this._escapeHTML(engineFull)}"><span class="engine-full">${this._escapeHTML(engineFull)}</span><span class="engine-short">${this._escapeHTML(engineShort)}</span></span>
        </div>
        <div class="card-actions card-menu">
          <button type="button" class="small-btn card-menu-btn" data-a="toggle-menu" aria-haspopup="true" aria-expanded="false" title="操作メニュー (コピー・修正・再翻訳・削除)">⋯ ▾</button>
          <div class="card-menu-dropdown" role="menu">
            <button type="button" class="card-menu-item" data-a="copy" role="menuitem">📋 コピー</button>
            <button type="button" class="card-menu-item" data-a="edit" role="menuitem">✏️ 修正</button>
            <button type="button" class="card-menu-item" data-a="retry" role="menuitem">🔄 再翻訳</button>
            <button type="button" class="card-menu-item card-menu-item-danger" data-a="delete" role="menuitem">🗑️ 削除</button>
          </div>
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
          <button type="button" class="btn btn-sm btn-outline" data-a="cancel">キャンセル</button>
          <button type="button" class="btn btn-sm btn-primary" data-a="save">保存</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      const action = btn ? btn.dataset.a : null;

      if (action === 'toggle-menu') {
        e.stopPropagation();
        const willOpen = !card.classList.contains('menu-open');
        this._closeAllCardMenus(willOpen ? card : null);
        card.classList.toggle('menu-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        return;
      }

      if (action === 'copy') {
        this._closeAllCardMenus();
        const textToCopy = `[${item.time}] (${item.speaker})\n原文: ${item.originalText}\n訳文: ${item.translatedText || '(翻訳中...)'}`;
        this.copyToClipboard(textToCopy)
          .then(() => this.showToast('カード内容をコピーしました。', 'info'))
          .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
        return;
      }

      if (action === 'edit') {
        this._closeAllCardMenus();
        // 常に最新の原文・訳文を編集欄へ同期してから開く（翻訳完了後の空欄バグ防止）
        const editOrigEl = document.getElementById(`${item.id}_edit_orig`);
        const editTransEl = document.getElementById(`${item.id}_edit_trans`);
        if (editOrigEl) editOrigEl.value = item.originalText || '';
        if (editTransEl) editTransEl.value = item.translatedText || '';
        document.getElementById(`${item.id}_view`).style.display = 'none';
        document.getElementById(`${item.id}_edit`).classList.add('open');
        return;
      }

      if (action === 'cancel') {
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        return;
      }

      if (action === 'save') {
        const editOrig = document.getElementById(`${item.id}_edit_orig`).value.trim();
        const editTrans = document.getElementById(`${item.id}_edit_trans`).value.trim();
        item.originalText = editOrig;
        item.translatedText = editTrans;
        item.isTranslating = false;
        document.getElementById(`${item.id}_orig`).textContent = editOrig;
        document.getElementById(`${item.id}_trans`).textContent = editTrans;
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        this.hasUnsavedChanges = true;
        this._updateUIState();
        this.showToast('修正内容を保存しました（Googleドキュメントへ未反映）。', 'success');
        return;
      }

      if (action === 'retry') {
        this._closeAllCardMenus();
        item.isTranslating = true;
        document.getElementById(`${item.id}_trans`).textContent = '⏳ 再翻訳中...';
        this.hasUnsavedChanges = true;
        this._updateUIState();
        this.translationService.enqueue(
          item.originalText,
          this.direction,
          this.category,
          this.apiKey,
          this.gasUrl,
          this.gasToken,
          item.id,
          (id, transResult) => this._onTranslationComplete(id, transResult),
          () => this._getRecentContext(item.id),
          this.translationCustomPrompt
        );
        this.showToast('再翻訳を開始しました。', 'info');
        return;
      }

      if (action === 'delete') {
        this._closeAllCardMenus();
        if (!confirm('この発話をタイムラインから削除しますか？')) return;
        this.records = this.records.filter((x) => x.id !== item.id);
        card.remove();
        this.hasUnsavedChanges = true;
        this.elRecordCount.textContent = `${this.records.length} 件の発話`;
        if (this.records.length === 0) {
          this.elEmptyState.style.display = 'block';
        }
        this._updateSummaryTargetPreview();
        this._updateUIState();
        this.showToast('発話を削除しました。', 'info');
        return;
      }

      const spkTarget = e.target.closest('.tag.speaker');
      if (spkTarget && spkTarget.id === `${item.id}_spk`) {
        const currIdx = ROLES.indexOf(item.speaker);
        item.speaker = ROLES[(currIdx + 1 + ROLES.length) % ROLES.length];
        spkTarget.textContent = getSpeakerShortLabel(item.speaker);
        spkTarget.title = `${item.speaker}（クリックで話者切替）`;
        spkTarget.className = 'tag speaker';
        if (item.speaker.includes('Auditor')) spkTarget.classList.add('auditor');
        else if (item.speaker.includes('Yard')) spkTarget.classList.add('yard');
        this.hasUnsavedChanges = true;
        this._updateUIState();
      }
    });

    this.elTranscriptList.prepend(card);
  }

  _onTranslationComplete(recordId, transResult) {
    const record = this.records.find((r) => r.id === recordId);
    // 翻訳中にユーザーがカードを削除した場合は安全にスキップ
    if (!record) return;

    record.translatedText = transResult.translated;
    if (transResult.speakerLang && transResult.speakerLang !== 'auto') {
      record.speakerLang = transResult.speakerLang;
    }
    record.isTranslating = false;

    const transEl = document.getElementById(`${recordId}_trans`);
    if (transEl) transEl.textContent = transResult.translated;

    const editTransEl = document.getElementById(`${recordId}_edit_trans`);
    const editBox = document.getElementById(`${recordId}_edit`);
    if (editTransEl && (!editBox || !editBox.classList.contains('open'))) {
      editTransEl.value = transResult.translated;
    }

    const langEl = document.getElementById(`${recordId}_lang`);
    if (langEl && record.speakerLang) {
      langEl.className = `tag lang-badge lang-${record.speakerLang}`;
      langEl.textContent = getLanguageBadge(record.speakerLang);
      langEl.title = getLanguageDisplayName(record.speakerLang);
    }

    this.hasUnsavedChanges = true;
    this._updateUIState();
    this.log('success', `翻訳反映完了: "${transResult.translated}"`);

    const finalizedCount = this.getFinalizedRecords().length;
    if (this.autoSave && (finalizedCount - this.savedRecordCount) >= 10 && this.gasUrl) {
      this.saveToDocs(true);
    }
  }

  // ---- Google Docs Sync ----
  async saveToDocs(isAuto = false) {
    if (this.isSavingDocs) {
      if (!isAuto) this.showToast('現在Googleドキュメントへ保存処理中です。完了までお待ちください。', 'info');
      return;
    }

    if (!this.gasUrl) {
      if (!isAuto) {
        this.showToast('GAS Web App URLが未設定です。設定画面から登録してください。', 'warning');
        this._openSettingsModal();
      }
      return;
    }

    this.isSavingDocs = true;
    try {
      if (this.translationService.isProcessing || this.translationService.queue.length > 0) {
        this.log('info', '進行中の翻訳処理の完了を待機しています...');
        let waitLimit = 0;
        while ((this.translationService.isProcessing || this.translationService.queue.length > 0) && waitLimit < 25) {
          await new Promise((r) => setTimeout(r, 200));
          waitLimit++;
        }
      }

      const finalizedItems = this.getFinalizedRecords();
      if (finalizedItems.length === 0) {
        if (!isAuto) {
          const hasPending = this.records.some((r) => r.isTranslating);
          this.showToast(
            hasPending
              ? '現在翻訳処理中のため、完了後に保存してください。'
              : '保存対象の確定翻訳がありません。録音・発話後に保存してください。',
            'info'
          );
        }
        return;
      }

      const recordsToSave = finalizedItems.map((r) => ({
        timestamp: r.time,
        speaker: r.speaker,
        speakerLang: r.speakerLang,
        original: r.originalText,
        translated: r.translatedText,
        engine: r.engine
      }));

      const isExistingMode = this.docMode === 'existing';
      let docId = isExistingMode ? (this.elInputDocId.value.trim() || this.lastDocId) : '';
      docId = GasStorageClient.extractDocId(docId);
      const title = this.elInputDocTitle.value.trim();
      const folderId = this.elInputFolderId ? this.elInputFolderId.value.trim() : this.folderId;

      this.elBtnSaveDocs.disabled = true;
      this.elSaveDocsText.textContent = isExistingMode ? 'ドキュメント同期中...' : 'ドキュメント保存中...';
      this.log(
        'info',
        `Google ドキュメント保存開始 (確定翻訳: ${recordsToSave.length}件, モード: ${isExistingMode && docId ? '同一Doc上書き同期' : '新規作成'})...`
      );

      let result;
      try {
        result = await GasStorageClient.saveTranscript(this.gasUrl, {
          token: this.gasToken,
          documentId: docId,
          title,
          folderId,
          records: recordsToSave,
          direction: this.direction,
          category: this.category,
          model: this.liveModel,
          saveMode: 'sync'
        });
      } catch (saveErr) {
        if (saveErr.code === 'DOC_NOT_FOUND' && docId) {
          this.log('warn', `指定ドキュメント (ID: ${docId}) が開けなかったため、新規Googleドキュメントとして再作成します...`);
          result = await GasStorageClient.saveTranscript(this.gasUrl, {
            token: this.gasToken,
            documentId: '',
            title,
            folderId,
            records: recordsToSave,
            direction: this.direction,
            category: this.category,
            model: this.liveModel,
            saveMode: 'sync'
          });
        } else {
          throw saveErr;
        }
      }

      this.savedRecordCount = recordsToSave.length;
      this.hasUnsavedChanges = false;
      this._updateUIState();

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

      this.elSavedDocBanner.style.display = 'flex';
      this.elSavedDocLink.href = result.documentUrl;
      this.elSavedDocLink.textContent = `📄 ${result.documentTitle || 'ドキュメント'} を開く ↗`;
      if (result.folderUrl && this.elSavedFolderLink && this.elSavedFolderSep) {
        this.elSavedFolderSep.style.display = 'inline';
        this.elSavedFolderLink.style.display = 'inline';
        this.elSavedFolderLink.href = result.folderUrl;
        this.elSavedFolderLink.textContent = `📁 ${result.folderName || '保存先フォルダ'} ↗`;
      }

      this.log('success', `Google ドキュメント同期保存完了 (確定翻訳: 全${recordsToSave.length}件): ${result.documentUrl}`);
      this.showToast(
        isAuto
          ? `確定翻訳 (全${recordsToSave.length}件) をGoogleドキュメントに自動同期しました。`
          : `確定翻訳 (全${recordsToSave.length}件) をひとつのGoogleドキュメントとして保存完了しました！`,
        'success'
      );
    } catch (err) {
      console.error('Save to Docs failed:', err);
      this.log('error', `GAS保存失敗: ${err.message}`);
      this.showToast('保存に失敗しました: ' + err.message, 'error');
    } finally {
      this.isSavingDocs = false;
      this.elBtnSaveDocs.disabled = false;
      this.elSaveDocsText.textContent = 'Google ドキュメントに保存';
      this._updateUIState();
    }
  }

  // ---- Modals, Clipboard & QR Sync ----
  _openSettingsModal() {
    this.elModal.style.display = 'flex';
    document.body.classList.add('modal-open');
    setTimeout(() => this.elInputApiKey?.focus(), 50);
  }

  _closeSettingsModal() {
    this.elModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  _closeQrModal() {
    this.elQrModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => this._fallbackCopyText(text));
    }
    return this._fallbackCopyText(text);
  }

  _fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, text.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  copyAllTranscripts() {
    if (this.records.length === 0) {
      this.showToast('コピーする履歴がありません。', 'warning');
      return;
    }

    const clean = (s) => String(s || '').replace(/\n/g, '<br>').replace(/\|/g, '\\|');
    let md = `# 現地監査 議事録 (${this.category})\n\n`;
    md += '| 時刻 | 話者 | 言語 | 原文 | 訳文 |\n|---|---|---|---|---|\n';
    for (const t of this.records) {
      md += `| ${clean(t.time)} | ${clean(t.speaker)} | ${clean(getLanguageDisplayName(t.speakerLang))} | ${clean(t.originalText)} | ${clean(t.translatedText)} |\n`;
    }

    this.copyToClipboard(md)
      .then(() => this.showToast('全履歴をMarkdown表形式でコピーしました。', 'info'))
      .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
  }

  _updateStatus(state, customLabel = null) {
    const statusMap = {
      recording: ['status-recording', '録音中 (REC)'],
      connecting: ['status-connecting', 'WS接続中...'],
      reconnecting: ['status-reconnecting', '再接続中...'],
      paused: ['status-connecting', '一時停止中'],
      error: ['status-error', 'エラー'],
      idle: ['status-idle', '待機中']
    };
    const [cls, defaultLabel] = statusMap[state] || statusMap.idle;
    this.elStatusBadge.className = `status-badge ${cls}`;
    this.elStatusText.textContent = customLabel || defaultLabel;
  }

  _updateUIState() {
    const recIcon = this.elBtnToggleRecord.querySelector('.btn-icon-symbol');
    const recText = this.elBtnToggleRecord.querySelector('.btn-text');
    const pauseIcon = this.elBtnPauseRecord.querySelector('.btn-icon-symbol');
    const pauseText = this.elBtnPauseRecord.querySelector('.btn-text');

    if (this.isRecording) {
      this.elBtnToggleRecord.classList.add('is-recording');
      recIcon.textContent = '⏹️';
      recText.textContent = '録音停止';
      this.elBtnPauseRecord.disabled = false;
    } else {
      this.elBtnToggleRecord.classList.remove('is-recording');
      const isDisplay = this.audioSource === 'display';
      recIcon.textContent = isDisplay ? '🖥️' : '🎤';
      recText.textContent = isDisplay ? 'PC音声共有開始' : '録音開始';
      this.elBtnPauseRecord.disabled = true;
    }

    pauseText.textContent = this.isPaused ? '再開' : '一時停止';
    pauseIcon.textContent = this.isPaused ? '▶️' : '⏸️';

    const finalizedCount = this.getFinalizedRecords().length;
    const unsavedCount = Math.max(0, finalizedCount - this.savedRecordCount);

    if (unsavedCount > 0 || (this.hasUnsavedChanges && finalizedCount > 0)) {
      this.elUnsavedBadge.style.display = 'inline-block';
      this.elUnsavedBadge.textContent = unsavedCount > 0 ? unsavedCount : '未保存';
      this.elUnsavedBadge.title = `${unsavedCount}件の未保存確定翻訳があります`;
    } else {
      this.elUnsavedBadge.style.display = 'none';
    }
  }

  _buildCompactSharePayload(includeFreePrompts = false) {
    const compact = {};
    if (this.apiKey) compact.k = this.apiKey;

    // GAS標準URLはデプロイIDのみ抽出して40文字以上削減
    if (this.gasUrl) {
      const m = this.gasUrl.trim().match(/^https:\/\/script\.google\.com\/macros\/s\/([^/]+)\/exec$/);
      if (m) compact.gd = m[1];
      else compact.gu = this.gasUrl.trim();
    }
    if (this.gasToken) compact.t = this.gasToken;

    // 既定値と異なる設定のみを短縮キーで格納
    if (this.direction && this.direction !== 'auto') compact.d = this.direction;
    if (this.category && this.category !== 'HKC') compact.c = this.category;
    if (this.chunkMode && this.chunkMode !== 'long') compact.cm = this.chunkMode;
    if (this.contextWindow !== undefined && Number(this.contextWindow) !== 6) compact.cw = Number(this.contextWindow);
    if (this.summaryRange && this.summaryRange !== '5') compact.sr = this.summaryRange;
    if (this.summaryRange === 'custom' && this.summaryCustomMin && Number(this.summaryCustomMin) !== 5) {
      compact.sm = Number(this.summaryCustomMin);
    }
    if (this.gain && this.gain !== '2.5') compact.g = this.gain;
    if (this.engineMode && this.engineMode !== 'auto') compact.em = this.engineMode;
    if (this.liveModel && this.liveModel !== DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL) compact.lm = this.liveModel;
    if (this.autoSave) compact.as = 1;
    if (this.docMode && this.docMode !== 'new') compact.dm = this.docMode;
    if (this.folderId && this.folderId !== DEFAULT_SETTINGS.DEFAULT_FOLDER_ID) compact.f = this.folderId;
    if (this.lastDocId && this.docMode === 'existing') compact.ld = this.lastDocId;

    // 翻訳プロンプト追記：プリセット一致時はIDのみ('@audit'等)で超軽量同期
    const trimmedCustomPrompt = (this.translationCustomPrompt || '').trim();
    if (trimmedCustomPrompt) {
      const matchedPreset = Object.entries(TRANSLATION_PROMPT_PRESETS).find(([, val]) => val.trim() === trimmedCustomPrompt);
      if (matchedPreset) {
        compact.tp = `@${matchedPreset[0]}`;
      } else if (includeFreePrompts) {
        compact.tp = trimmedCustomPrompt;
      }
    }

    // systemInstruction：既定値から変更され、かつ明示チェック時のみ格納
    const trimmedSys = (this.systemInstruction || '').trim();
    if (includeFreePrompts && trimmedSys && trimmedSys !== DEFAULT_SYSTEM_INSTRUCTION.trim()) {
      compact.si = trimmedSys;
    }

    return compact;
  }

  _renderQrCode() {
    const includePrompts = !!this.elCheckQrIncludePrompts?.checked;
    const compact = this._buildCompactSharePayload(includePrompts);
    const baseUrl = window.location.origin + window.location.pathname;
    const buildUrl = (obj) => `${baseUrl}#s=${encodeBase64UrlUtf8(JSON.stringify(obj))}`;

    let shareUrl = buildUrl(compact);
    this.elInputShareUrl.value = shareUrl;

    if (window.QRCode && QRCode.renderCanvas && this.elQrCanvas) {
      const renderOpts = { size: 280, margin: 4, dark: '#000000', light: '#FFFFFF' };
      let meta;
      try {
        meta = QRCode.renderCanvas(this.elQrCanvas, shareUrl, renderOpts);
      } catch (qrOverflowErr) {
        delete compact.si;
        delete compact.tp;
        shareUrl = buildUrl(compact);
        this.elInputShareUrl.value = shareUrl;
        meta = QRCode.renderCanvas(this.elQrCanvas, shareUrl, renderOpts);
        this.showToast('プロンプトが長すぎるため、QRコードからは自由記述プロンプトを省略しました。', 'warning');
      }

      if (this.elQrDensityMeta && meta) {
        const isDense = meta.version >= 15;
        this.elQrDensityMeta.className = isDense ? 'qr-density-meta is-dense' : 'qr-density-meta';
        this.elQrDensityMeta.textContent = isDense
          ? `⚠️ QR v${meta.version} (${meta.moduleCount}×${meta.moduleCount} / ${meta.length}文字) — やや高密度です（プロンプト除外で軽量化できます）`
          : `✅ QR v${meta.version} (${meta.moduleCount}×${meta.moduleCount} / ${meta.length}文字) — 高速スキャン対応（軽量最適化済）`;
      }
    }
  }

  _openQrModal() {
    if (!this.apiKey && !this.gasUrl) {
      this.showToast('先に「⚙️ 設定」でGemini APIキーまたはGAS設定を入力してください。', 'warning');
      this._openSettingsModal();
      return;
    }

    try {
      if (this.elCheckQrIncludePrompts) {
        this.elCheckQrIncludePrompts.checked = false;
      }
      this._renderQrCode();
      this.elQrModal.style.display = 'flex';
      document.body.classList.add('modal-open');
      this.log('info', `スマホ連携用QRコードを表示しました (URL長: ${this.elInputShareUrl.value.length}文字)。`);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      this.showToast('QRコードの生成に失敗しました: ' + err.message, 'error');
    }
  }

  _checkHashConfig() {
    const hash = window.location.hash;
    if (!hash || (!hash.startsWith('#s=') && !hash.startsWith('#setup='))) return;

    try {
      const K = ConfigManager.STORAGE_KEYS;

      if (hash.startsWith('#s=')) {
        // v3.0.2 超軽量コンパクト形式 (#s=<base64url>)
        const c = JSON.parse(decodeBase64UrlUtf8(hash.substring(3)));

        if (c.k) ConfigManager.set(K.API_KEY, String(c.k));
        if (c.gd) ConfigManager.set(K.GAS_URL, `https://script.google.com/macros/s/${c.gd}/exec`);
        else if (c.gu) ConfigManager.set(K.GAS_URL, String(c.gu));
        if (c.t !== undefined) ConfigManager.set(K.GAS_TOKEN, String(c.t));

        ConfigManager.set(K.DIRECTION, c.d || 'auto');
        ConfigManager.set(K.CATEGORY, c.c || 'HKC');
        ConfigManager.set(K.CHUNK_MODE, c.cm || 'long');
        ConfigManager.set(K.CONTEXT_WINDOW, String(c.cw !== undefined ? c.cw : 6));
        ConfigManager.set(K.SUMMARY_RANGE, c.sr || '5');
        ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(c.sm !== undefined ? c.sm : 5));
        ConfigManager.set(K.GAIN, c.g || '2.5');
        ConfigManager.set(K.ENGINE_MODE, c.em || 'auto');
        ConfigManager.set(K.LIVE_MODEL, c.lm || DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL);
        ConfigManager.set(K.AUTO_SAVE, String(Boolean(c.as)));
        ConfigManager.set(K.DOC_MODE, c.dm || 'new');
        ConfigManager.set(K.FOLDER_ID, c.f || DEFAULT_SETTINGS.DEFAULT_FOLDER_ID);
        if (c.ld !== undefined) ConfigManager.set(K.LAST_DOC_ID, String(c.ld));

        if (c.tp !== undefined) {
          const tpStr = String(c.tp);
          if (tpStr.startsWith('@') && TRANSLATION_PROMPT_PRESETS[tpStr.slice(1)]) {
            ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, TRANSLATION_PROMPT_PRESETS[tpStr.slice(1)]);
          } else {
            ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, tpStr);
          }
        }
        if (c.si !== undefined) {
          ConfigManager.set(K.SYSTEM_INSTRUCTION, String(c.si));
        }
      } else {
        // 旧形式 (#setup=...) 後方互換サポート
        const config = JSON.parse(decodeBase64Utf8(decodeURIComponent(hash.substring(7))));
        const legacyMap = [
          ['apiKey', K.API_KEY],
          ['gasUrl', K.GAS_URL],
          ['gasToken', K.GAS_TOKEN],
          ['direction', K.DIRECTION],
          ['category', K.CATEGORY],
          ['chunkMode', K.CHUNK_MODE],
          ['summaryRange', K.SUMMARY_RANGE],
          ['gain', K.GAIN],
          ['engineMode', K.ENGINE_MODE],
          ['liveModel', K.LIVE_MODEL],
          ['systemInstruction', K.SYSTEM_INSTRUCTION],
          ['docMode', K.DOC_MODE],
          ['lastDocId', K.LAST_DOC_ID],
          ['folderId', K.FOLDER_ID]
        ];
        for (const [field, storageKey] of legacyMap) {
          if (config[field]) ConfigManager.set(storageKey, String(config[field]));
        }
        if (config.contextWindow !== undefined) ConfigManager.set(K.CONTEXT_WINDOW, String(config.contextWindow));
        if (config.summaryCustomMin !== undefined) ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(config.summaryCustomMin));
        if (config.translationCustomPrompt !== undefined) ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, String(config.translationCustomPrompt));
        if (config.autoSave !== undefined) ConfigManager.set(K.AUTO_SAVE, String(config.autoSave));
      }

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

  showToast(message, type = 'info') {
    if (!this.elToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconMap = { success: '✅', error: '⚠️', warning: '🔔', info: 'ℹ️' };
    toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${this._escapeHTML(message)}</span>`;
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
