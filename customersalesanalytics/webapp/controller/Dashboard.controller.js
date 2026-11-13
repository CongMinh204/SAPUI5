sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/format/NumberFormat",
    "sap/base/Log"
], function (Controller, JSONModel, Filter, FilterOperator, NumberFormat, Log) {
    "use strict";

    var ENTITY_SET = "/ZC324_PROJECT2";
    var ALL = "__ALL__";

    return Controller.extend("com.example.customeranalytics.customersalesanalytics.controller.Dashboard", {

        // =====================================================
        // 1. KHỞI TẠO
        // =====================================================
        onInit: function () {
            this._aAll = [];          // toàn bộ khách hàng đọc từ OData
            this._oAmountFormat = NumberFormat.getFloatInstance({
                maxFractionDigits: 2,
                groupingEnabled: true
            });

            this.getView().setModel(new JSONModel({
                selCountry: ALL,
                selCurrency: "",
                countryOptions: [],
                currencyOptions: [],
                kpi: {
                    totalCustomers: "0",
                    activeCustomers: "0",
                    activeRate: "",
                    totalOrders: "0",
                    totalValue: "0",
                    totalValueScale: ""
                },
                top10: [],
                byArea: [],
                hasMessage: false,
                message: ""
            }), "dash");

            this._initCharts();
            this._loadAll();
        },

        _initCharts: function () {
            this.byId("chartTop10").setVizProperties({
                title: { visible: true, text: "Top 10 khách hàng có giá trị mua cao nhất" },
                plotArea: { dataLabel: { visible: true } },
                legend: { visible: false },
                valueAxis: { title: { visible: false } },
                categoryAxis: { title: { visible: false } }
            });
            this.byId("chartCountry").setVizProperties({
                title: { visible: true, text: "Khách hàng theo quốc gia" },
                plotArea: { dataLabel: { visible: true } },
                valueAxis: { title: { visible: false } },
                categoryAxis: { title: { visible: false } }
            });
        },

        // =====================================================
        // 2. ĐỌC DỮ LIỆU TỪ ODATA
        // =====================================================
        _loadAll: function () {
            var oModel = this.getOwnerComponent().getModel();
            this._setMessage("");

            oModel.read(ENTITY_SET, {
                urlParameters: {
                    "$select": "CustomerNumber,CustomerName,Country,Region,City," +
                               "TotalOrders,TotalOrderValue,Currency,HasTransaction"
                },
                success: function (oData) {
                    this._aAll = oData.results || [];
                    this._buildOptions();
                    this._recalc();
                    this._loadTop10();
                }.bind(this),
                error: this._onError.bind(this)
            });
        },

        // Top 10 lấy trực tiếp từ backend: $filter + $orderby + $top
        _loadTop10: function () {
            var oDash = this.getView().getModel("dash");
            var sCountry = oDash.getProperty("/selCountry");
            var sCurrency = oDash.getProperty("/selCurrency");
            var aFilters = [new Filter("TotalOrders", FilterOperator.GT, 0)];

            if (sCurrency) {
                aFilters.push(new Filter("Currency", FilterOperator.EQ, sCurrency));
            }
            if (sCountry && sCountry !== ALL) {
                aFilters.push(new Filter("Country", FilterOperator.EQ, sCountry));
            }

            this.getOwnerComponent().getModel().read(ENTITY_SET, {
                filters: [new Filter({ filters: aFilters, and: true })],
                urlParameters: {
                    "$orderby": "TotalOrderValue desc",
                    "$top": "10",
                    "$select": "CustomerNumber,CustomerName,Country,TotalOrders,TotalOrderValue,Currency"
                },
                success: function (oData) {
                    var aTop = (oData.results || []).map(function (o, i) {
                        return {
                            Rank: i + 1,
                            CustomerNumber: o.CustomerNumber,
                            CustomerName: o.CustomerName || o.CustomerNumber,
                            Country: o.Country,
                            TotalOrders: o.TotalOrders,
                            // Edm.Decimal trả về dạng chuỗi, biểu đồ cần số
                            TotalOrderValue: parseFloat(o.TotalOrderValue) || 0,
                            Currency: o.Currency
                        };
                    });
                    oDash.setProperty("/top10", aTop);
                },
                error: this._onError.bind(this)
            });
        },

        // =====================================================
        // 3. TÍNH THỐNG KÊ
        // =====================================================
        _isActive: function (o) {
            return o.HasTransaction === "X" || Number(o.TotalOrders) > 0;
        },

        _buildOptions: function () {
            var oDash = this.getView().getModel("dash");
            var mCountry = {};
            var mCurrency = {};

            this._aAll.forEach(function (o) {
                mCountry[o.Country || ""] = true;
                if (this._isActive(o) && o.Currency) {
                    mCurrency[o.Currency] = (mCurrency[o.Currency] || 0) + 1;
                }
            }.bind(this));

            var aCountry = [{ key: ALL, text: "Tất cả" }].concat(
                Object.keys(mCountry).sort().map(function (k) {
                    return { key: k, text: k || "(trống)" };
                })
            );

            // Loại tiền nhiều khách nhất đứng đầu và được chọn sẵn
            var aCurrency = Object.keys(mCurrency).sort(function (a, b) {
                return mCurrency[b] - mCurrency[a];
            }).map(function (k) {
                return { key: k, text: k };
            });

            oDash.setProperty("/countryOptions", aCountry);
            oDash.setProperty("/currencyOptions", aCurrency);
            if (!oDash.getProperty("/selCurrency") && aCurrency.length) {
                oDash.setProperty("/selCurrency", aCurrency[0].key);
            }
        },

        _recalc: function () {
            var oDash = this.getView().getModel("dash");
            var sCountry = oDash.getProperty("/selCountry");
            var sCurrency = oDash.getProperty("/selCurrency");
            var bByRegion = sCountry && sCountry !== ALL;

            var aData = this._aAll.filter(function (o) {
                return !bByRegion || (o.Country || "") === sCountry;
            });

            var iActive = 0;
            var iOrders = 0;
            var fValue = 0;
            var mArea = {};

            aData.forEach(function (o) {
                var bActive = this._isActive(o);
                // Chọn 1 quốc gia thì thống kê theo vùng (Region), ngược lại theo quốc gia
                var sArea = (bByRegion ? o.Region : o.Country) || "(trống)";

                if (!mArea[sArea]) {
                    mArea[sArea] = { Area: sArea, CustomerCount: 0, ActiveCount: 0 };
                }
                mArea[sArea].CustomerCount++;

                if (bActive) {
                    iActive++;
                    mArea[sArea].ActiveCount++;
                }
                iOrders += Number(o.TotalOrders) || 0;
                if (o.Currency === sCurrency) {
                    fValue += parseFloat(o.TotalOrderValue) || 0;
                }
            }.bind(this));

            var aArea = Object.keys(mArea).map(function (k) {
                return mArea[k];
            }).sort(function (a, b) {
                return b.CustomerCount - a.CustomerCount;
            }).slice(0, 15);   // tối đa 15 cột cho dễ nhìn

            var oScaled = this._scale(fValue);

            oDash.setProperty("/kpi", {
                totalCustomers: String(aData.length),
                activeCustomers: String(iActive),
                activeRate: aData.length ? (Math.round(iActive * 1000 / aData.length) / 10) + "% tổng số khách" : "",
                totalOrders: String(iOrders),
                totalValue: oScaled.value,
                totalValueScale: oScaled.scale
            });
            oDash.setProperty("/byArea", aArea);

            this.byId("chartCountry").setVizProperties({
                title: { text: bByRegion ? "Khách hàng theo vùng của " + sCountry : "Khách hàng theo quốc gia" }
            });
        },

        _scale: function (f) {
            if (f >= 1e9) { return { value: (f / 1e9).toFixed(2), scale: "B" }; }
            if (f >= 1e6) { return { value: (f / 1e6).toFixed(2), scale: "M" }; }
            if (f >= 1e3) { return { value: (f / 1e3).toFixed(1), scale: "K" }; }
            return { value: f.toFixed(0), scale: "" };
        },

        // =====================================================
        // 4. SỰ KIỆN
        // =====================================================
        onFilterChange: function () {
            this._recalc();
            this._loadTop10();
        },

        onRefresh: function () {
            this._loadAll();
        },

        onGoToList: function () {
            this.getOwnerComponent().getRouter().navTo("RouteCustomerList");
        },

        onTop10Press: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext("dash").getProperty("CustomerNumber");
            this.getOwnerComponent().getRouter().navTo("RouteCustomerDetail", { customerId: sId });
        },

        formatAmount: function (v) {
            return this._oAmountFormat.format(parseFloat(v) || 0);
        },

        // =====================================================
        // 5. LỖI
        // =====================================================
        _setMessage: function (sText) {
            var oDash = this.getView().getModel("dash");
            oDash.setProperty("/message", sText);
            oDash.setProperty("/hasMessage", !!sText);
        },

        _onError: function (oError) {
            var sMessage = "Không đọc được dữ liệu OData.";
            try {
                sMessage = JSON.parse(oError.responseText).error.message.value;
            } catch (oParseErr) {
                Log.debug("[Dashboard] Response is not JSON", oParseErr.message);
                if (oError && oError.message) {
                    sMessage = oError.message;
                }
            }
            Log.error("[Dashboard] OData error", sMessage);
            this._setMessage(sMessage);
        }
    });
});