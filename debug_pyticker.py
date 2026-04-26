from pytickersymbols import PyTickerSymbols
stock_data = PyTickerSymbols()
indices = list(stock_data.get_all_indices())
print("Indices:", indices)

stocks = list(stock_data.get_stocks_by_index('DAX'))
if stocks:
    print("Example stock from DAX:", stocks[0])
else:
    print("No stocks found for DAX")
