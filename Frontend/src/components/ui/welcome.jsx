import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const WelcomeMessage = ({ onImportData, onBulkImportData, isLoading }) => {
  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Welcome! Your database is empty</h3>
            <p className="text-sm text-gray-600">
                {isLoading 
                    ? "Importing the dataset into the Neo4j graph database is in progress, with a high number of movies, actors and directors, it may take a while..."
                    : "Load data from the Chinese movie dataset from the maoyan website to get started"}            
            </p>
          </div>
          <Button 
            onClick={onImportData} 
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 shrink-0 ml-4"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Importing...
              </>
            ) : (
              'Import Data'
            )}
          </Button>
          <Button 
            onClick={onBulkImportData} 
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 shrink-0 ml-4"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Bulk Importing...
              </>
            ) : (
              'Bulk Import Data'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export { WelcomeMessage };