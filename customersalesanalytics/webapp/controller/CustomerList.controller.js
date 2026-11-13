sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/ui/core/format/NumberFormat",
    "sap/m/MessageToast"
], function (Controller, JSONModel, Filter, FilterOperator, History, NumberFormat, MessageToast) {
    "use strict";

    return Controller.extend("com.example.customeranalytics.customersalesanalytics.controller.CustomerList", {

        onInit: function () {
            this._oAmountFormat = NumberFormat.getFloatInstance({
                maxFractionDigits: 2,
                groupingEnabled: true
            });
            this._mCompanyCustomers = {};   // cache: công ty -> danh sách mã khách hàng
            this._iFilterReq = 0;           // đánh số lần lọc để bỏ qua kết quả cũ
            this.getView().setModel(new JSONModel({ countries: [], companies: [] }), "lf");
            this._loadCountries();
            this._loadCompanies();
        },

        // Lấy danh sách quốc gia cho ComboBox
        _loadCountries: function () {
            var oLf = this.getView().getModel("lf");
            this.getOwnerComponent().getModel().read("/ZC324_PROJECT2", {
                urlParameters: { "$select": "Country" },
                success: function (oData) {
                    var mSeen = {};
                    (oData.results || []).forEach(function (o) {
                        if (o.Country) {
                            mSeen[o.Country] = true;
                        }
                    });
                    oLf.setProperty("/countries", Object.keys(mSeen).sort().map(function (k) {
                        return { key: k, text: k };
                    }));
                }
            });
        },

        // Lấy danh sách công ty (Sales Organization - VKORG) từ đơn hàng VBAK
        _loadCompanies: function () {
            var oLf = this.getView().getModel("lf");
            this.getOwnerComponent().getModel().read("/VBAK", {
                urlParameters: { "$select": "VKORG" },
                success: function (oData) {
                    var mSeen = {};
                    (oData.results || []).forEach(function (o) {
                        if (o.VKORG) {
                            mSeen[o.VKORG] = true;
                        }
                    });
                    oLf.setProperty("/companies", Object.keys(mSeen).sort().map(function (k) {
                        return { key: k, text: k };
                    }));
                }
            });
        },

        // Các khách hàng đã có đơn thuộc 1 công ty: đọc VBAK theo VKORG rồi lấy KUNNR không trùng
        _getCustomersOfCompany: function (sCompany, fnSuccess, fnError) {
            var mCache = this._mCompanyCustomers;

            if (mCache[sCompany]) {
                fnSuccess(mCache[sCompany]);
                return;
            }
            this.getOwnerComponent().getModel().read("/VBAK", {
                filters: [new Filter("VKORG", FilterOperator.EQ, sCompany)],
                urlParameters: { "$select": "KUNNR" },
                success: function (oData) {
                    var mSeen = {};
                    (oData.results || []).forEach(function (o) {
                        if (o.KUNNR) {
                            mSeen[o.KUNNR] = true;
                        }
                    });
                    mCache[sCompany] = Object.keys(mSeen);
                    fnSuccess(mCache[sCompany]);
                },
                error: fnError
            });
        },

        // =====================================================
        // LỌC: gửi $filter xuống backend
        // =====================================================
        onApplyFilter: function () {
            var sCompany = this.byId("cbCompany").getSelectedKey();
            var iReq = ++this._iFilterReq;

            if (!sCompany) {
                this._applyFilters(null);
                return;
            }

            // Có chọn công ty: lấy danh sách khách của công ty trước, rồi mới lọc bảng
            this._getCustomersOfCompany(sCompany, function (aCustomerIds) {
                if (iReq === this._iFilterReq) {
                    this._applyFilters(aCustomerIds);
                }
            }.bind(this), function () {
                if (iReq === this._iFilterReq) {
                    MessageToast.show("Không đọc được dữ liệu khách hàng theo công ty " + sCompany);
                }
            });
        },

        // aCustomerIds = null: không lọc theo công ty; mảng rỗng: công ty chưa có khách nào
        _applyFilters: function (aCustomerIds) {
            var aFilters = [];
            var sQuery = (this.byId("searchField").getValue() || "").trim();
            var sCountry = this.byId("cbCountry").getSelectedKey();
            var sRegion = (this.byId("inRegion").getValue() || "").trim().toUpperCase();
            var bActive = this.byId("cbActive").getSelected();

            if (sQuery) {
                // Tìm theo mã HOẶC tên (tên phân biệt hoa/thường)
                aFilters.push(new Filter({
                    filters: [
                        new Filter("CustomerNumber", FilterOperator.Contains, sQuery.toUpperCase()),
                        new Filter("CustomerName", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            if (sCountry) {
                aFilters.push(new Filter("Country", FilterOperator.EQ, sCountry));
            }
            if (sRegion) {
                aFilters.push(new Filter("Region", FilterOperator.EQ, sRegion));
            }
            if (bActive) {
                aFilters.push(new Filter("TotalOrders", FilterOperator.GT, 0));
            }
            if (aCustomerIds) {
                if (aCustomerIds.length) {
                    aFilters.push(new Filter({
                        filters: aCustomerIds.map(function (sId) {
                            return new Filter("CustomerNumber", FilterOperator.EQ, sId);
                        }),
                        and: false
                    }));
                } else {
                    // Công ty chưa có khách nào: điều kiện không bao giờ đúng để bảng trống
                    aFilters.push(new Filter("CustomerNumber", FilterOperator.EQ, ""));
                }
            }

            this.byId("customerTable").getBinding("items").filter(
                aFilters.length ? new Filter({ filters: aFilters, and: true }) : []
            );
        },

        onClearFilter: function () {
            this.byId("searchField").setValue("");
            this.byId("cbCountry").setSelectedKey("");
            this.byId("cbCountry").setValue("");
            this.byId("cbCompany").setSelectedKey("");
            this.byId("cbCompany").setValue("");
            this.byId("inRegion").setValue("");
            this.byId("cbActive").setSelected(false);
            this.onApplyFilter();
        },

        // Hiện tổng số dòng trên tiêu đề bảng
        onUpdateFinished: function (oEvent) {
            var iTotal = oEvent.getParameter("total");
            this.byId("tableTitle").setText("Khách hàng (" + iTotal + ")");
        },

        // =====================================================
        // ĐIỀU HƯỚNG
        // =====================================================
        onItemPress: function (oEvent) {
            var sId = oEvent.getSource().getBindingContext().getProperty("CustomerNumber");
            this.getOwnerComponent().getRouter().navTo("RouteCustomerDetail", { customerId: sId });
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteDashboard", {}, true);
            }
        },

        formatAmount: function (v) {
            return this._oAmountFormat.format(parseFloat(v) || 0);
        }
    });
});
